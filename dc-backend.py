"""
dc_backend.py — Digital Craft Tbilisi Analytics Backend v3.1
=============================================================
Эндпоинты:
  GET  /geo?sid=SESSION_ID      — определяет страну по IP, пишет в Firestore
  GET  /report                  — сводный отчёт по сессиям/событиям
  GET  /sessions?days=30        — полные данные сессий (с гео + exit-данными)
  GET  /cohorts                 — когортный анализ (новые vs вернувшиеся по неделям)
  GET  /funnel                  — воронка по заданным событиям
  GET  /export/csv              — экспорт всех данных в CSV
  POST /export/sheets           — экспорт в Google Sheets
  GET  /health                  — статус сервиса

Новое в v3.1:
  - Джойнит analytics_session_exit (exitUrl, depth, activeSeconds) в сессии
  - Эндпоинт /sessions возвращает полные данные сессий для таблицы посещений
  - CORS расширен для разработки
  - Улучшена обработка ошибок геолокации

Деплой (бесплатно):
  render.com → New Web Service → Python → команда: python dc_backend.py

Переменные окружения (задать в панели хостинга):
  FIREBASE_PROJECT_ID       — razrabotka-b61bc
  FIREBASE_SERVICE_ACCOUNT  — JSON сервисного аккаунта (одной строкой)
  GOOGLE_SHEETS_ID          — ID таблицы Google Sheets (опционально)
"""

import os
import json
import csv
import io
import time
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from collections import defaultdict

from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import geoip2.database
import requests

# ─── Опционально: Google Sheets ─────────────────────────────────────────────
try:
    import gspread
    from google.oauth2.service_account import Credentials as SACredentials
    SHEETS_OK = True
except ImportError:
    SHEETS_OK = False

app = Flask(__name__)
CORS(app, origins=[
    'https://digital-craft-tbilisi.site',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:5500',  # VS Code Live Server
    'http://127.0.0.1:*',
    'http://localhost:*'
])

# ═══════════════════════════════════════════════════════════════════════════════
#  ИНИЦИАЛИЗАЦИЯ
# ═══════════════════════════════════════════════════════════════════════════════

PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID', 'razrabotka-b61bc')
SHEETS_ID  = os.environ.get('GOOGLE_SHEETS_ID', '')
GEOIP_DB   = os.path.join(os.path.dirname(__file__), 'GeoLite2-City.mmdb')

# Firebase
def init_firebase():
    if firebase_admin._apps:
        return firestore.client()
    sa_env = os.environ.get('FIREBASE_SERVICE_ACCOUNT')
    if sa_env:
        cred = credentials.Certificate(json.loads(sa_env))
    elif os.path.exists('service-account.json'):
        cred = credentials.Certificate('service-account.json')
    else:
        raise RuntimeError(
            'FIREBASE_SERVICE_ACCOUNT env var not set. '
            'Add it in Render -> Environment.'
        )
    firebase_admin.initialize_app(cred)
    return firestore.client()

try:
    db = init_firebase()
except Exception as _e:
    import sys
    print(f'[FATAL] Firebase init failed: {_e}', file=sys.stderr)
    sys.exit(1)

# GeoIP
geo_reader = None
if os.path.exists(GEOIP_DB):
    geo_reader = geoip2.database.Reader(GEOIP_DB)

# ═══════════════════════════════════════════════════════════════════════════════
#  FIRESTORE HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def get_sessions(days=30, limit=5000):
    """
    Загружает сессии за последние N дней.
    Джойнит:
      - geo из analytics_geo (страна, город, регион)
      - exit-данные из analytics_session_exit (exitUrl, depth, activeSeconds)
    """
    cutoff = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp() * 1000)
    docs = (
        db.collection('analytics_sessions')
          .where('ts', '>=', cutoff)
          .order_by('ts', direction=firestore.Query.DESCENDING)
          .limit(limit)
          .stream()
    )
    sessions = [d.to_dict() | {'_doc_id': d.id} for d in docs]

    if not sessions:
        return sessions

    sids = {s.get('id') for s in sessions if s.get('id')}

    # ── Джойн гео ────────────────────────────────────────────────────────────
    no_geo = [s for s in sessions if not s.get('country')]
    if no_geo:
        no_geo_sids = {s.get('id') for s in no_geo if s.get('id')}
        geo_map = {}
        for sid in no_geo_sids:
            try:
                doc = db.collection('analytics_geo').document(sid).get()
                if doc.exists:
                    geo_map[sid] = doc.to_dict()
            except Exception:
                pass
        for s in sessions:
            sid = s.get('id')
            if sid and sid in geo_map:
                g = geo_map[sid]
                s['country'] = g.get('country', '')
                s['city']    = g.get('city', '')
                s['region']  = g.get('region', '')

    # ── Джойн exit-данных (exitUrl, depth, activeSeconds) ────────────────────
    # Трекер v3.1 пишет эти данные в analytics_session_exit/{sid}
    exit_map = {}
    for sid in sids:
        try:
            doc = db.collection('analytics_session_exit').document(sid).get()
            if doc.exists:
                exit_map[sid] = doc.to_dict()
        except Exception:
            pass

    for s in sessions:
        sid = s.get('id')
        if sid and sid in exit_map:
            ex = exit_map[sid]
            s.setdefault('exitUrl',       ex.get('exitUrl', ''))
            s.setdefault('depth',         ex.get('depth', 1))
            s.setdefault('activeSeconds', ex.get('activeSeconds', 0))

    return sessions


def get_pageviews(days=30, limit=10000):
    cutoff = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp() * 1000)
    docs = (
        db.collection('analytics_pageviews')
          .where('ts', '>=', cutoff)
          .order_by('ts', direction=firestore.Query.DESCENDING)
          .limit(limit)
          .stream()
    )
    return [d.to_dict() for d in docs]


def get_events(days=30, limit=10000):
    cutoff = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp() * 1000)
    docs = (
        db.collection('analytics_events')
          .where('ts', '>=', cutoff)
          .order_by('ts', direction=firestore.Query.DESCENDING)
          .limit(limit)
          .stream()
    )
    return [d.to_dict() for d in docs]


def patch_geo_by_sid(sid, geo, ip):
    """Пишет гео-данные в analytics_geo/{sid}."""
    if not sid:
        return
    try:
        db.collection('analytics_geo').document(sid).set({
            'sid':     sid,
            'ts':      int(datetime.now(timezone.utc).timestamp() * 1000),
            'country': geo.get('country', ''),
            'city':    geo.get('city', ''),
            'region':  geo.get('region', ''),
            'ip_hash': str(abs(hash(ip)) % 10**8)
        })
        app.logger.info(f'geo saved: sid={sid} country={geo.get("country")}')
    except Exception as e:
        app.logger.error(f'geo save error: {e}')


# ═══════════════════════════════════════════════════════════════════════════════
#  IP-ГЕОЛОКАЦИЯ
# ═══════════════════════════════════════════════════════════════════════════════

def get_ip():
    for header in ('X-Forwarded-For', 'X-Real-IP', 'CF-Connecting-IP'):
        val = request.headers.get(header)
        if val:
            return val.split(',')[0].strip()
    return request.remote_addr


def lookup_geo(ip):
    """Возвращает {'country': ..., 'city': ..., 'region': ...} по IP."""
    # Пропускаем локальные адреса
    if ip and (ip.startswith('127.') or ip.startswith('192.168.') or ip == '::1'):
        return {'country': 'Local', 'city': 'Local', 'region': ''}

    if geo_reader:
        try:
            rec = geo_reader.city(ip)
            return {
                'country': rec.country.name or '',
                'city':    rec.city.name or '',
                'region':  rec.subdivisions.most_specific.name or ''
            }
        except Exception:
            pass

    # Fallback: бесплатный публичный API
    try:
        r = requests.get(
            f'http://ip-api.com/json/{ip}?fields=country,regionName,city',
            timeout=4
        )
        if r.ok:
            data = r.json()
            return {
                'country': data.get('country', ''),
                'city':    data.get('city', ''),
                'region':  data.get('regionName', '')
            }
    except Exception:
        pass

    return {'country': '', 'city': '', 'region': ''}


@app.route('/geo')
def geo_endpoint():
    """
    GET /geo?sid=SESSION_ID
    Определяет IP → страну/город → пишет в analytics_geo/{sid}.
    """
    sid = request.args.get('sid', '')
    ip  = get_ip()
    geo = lookup_geo(ip)

    if sid and geo.get('country'):
        patch_geo_by_sid(sid, geo, ip)

    return jsonify(geo)


# ═══════════════════════════════════════════════════════════════════════════════
#  СЕССИИ — ПОЛНЫЕ ДАННЫЕ ДЛЯ ТАБЛИЦЫ ПОСЕЩЕНИЙ
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/sessions')
def sessions_endpoint():
    """
    GET /sessions?days=30&limit=1000
    Возвращает полные данные сессий с джойном гео и exit-данных.
    Используется дашбордом для страницы «Все посещения».
    """
    days  = int(request.args.get('days', 30))
    limit = int(request.args.get('limit', 1000))

    sessions  = get_sessions(days, limit=limit)
    pageviews = get_pageviews(days, limit=limit * 5)

    # Строим историю страниц по каждой сессии
    pv_by_sid = defaultdict(list)
    for pv in sorted(pageviews, key=lambda x: x.get('ts', 0)):
        sid = pv.get('sid')
        if sid:
            pv_by_sid[sid].append(pv)

    # Строим активное время из событий (если нет в session_exit)
    events = get_events(days, limit=limit * 3)
    active_by_sid = {}
    for e in events:
        if e.get('name') == 'active_time' and e.get('p_seconds', 0) > 0:
            active_by_sid[e['sid']] = e['p_seconds']

    result = []
    for s in sessions:
        sid   = s.get('id', '')
        pages = pv_by_sid.get(sid, [])

        entry_url = pages[0]['url'] if pages else s.get('startUrl', '/')
        exit_url  = s.get('exitUrl') or (pages[-1]['url'] if pages else s.get('startUrl', '/'))
        next_url  = pages[1]['url'] if len(pages) > 1 else ''
        depth     = s.get('depth') or len(pages) or 1
        active_s  = s.get('activeSeconds') or active_by_sid.get(sid, 0)

        # Вычисляем время на сайте из просмотров, если нет активного времени
        if not active_s and len(pages) > 1:
            active_s = round((pages[-1]['ts'] - pages[0]['ts']) / 1000)

        ts_dt = datetime.fromtimestamp(s.get('ts', 0) / 1000, tz=timezone.utc)

        result.append({
            'sid':          sid,
            'ts':           s.get('ts', 0),
            'ts_human':     ts_dt.strftime('%Y-%m-%d %H:%M'),
            'src':          s.get('src', 'direct'),
            'ref':          s.get('refDomain') or s.get('ref', ''),
            'utm_campaign': s.get('utm_campaign', ''),
            'utm_source':   s.get('utm_source', ''),
            'utm_medium':   s.get('utm_medium', ''),
            'entry_url':    entry_url,
            'next_url':     next_url,
            'exit_url':     exit_url,
            'depth':        depth,
            'time_on_site': active_s,
            'br':           s.get('br', ''),
            'os':           s.get('os', ''),
            'dev':          s.get('dev', 'desktop'),
            'country':      s.get('country', ''),
            'city':         s.get('city', ''),
            'region':       s.get('region', ''),
            'is_new':       bool(s.get('isNew', False)),
            'lang':         s.get('lang', ''),
            'tz':           s.get('tz', ''),
        })

    return jsonify({
        'days':     days,
        'total':    len(result),
        'sessions': result
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  СВОДНЫЙ ОТЧЁТ
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/report')
def report():
    """GET /report?days=30 — сводный отчёт."""
    days      = int(request.args.get('days', 30))
    sessions  = get_sessions(days)
    pageviews = get_pageviews(days)
    events    = get_events(days)

    page_counts = defaultdict(int)
    for pv in pageviews:
        page_counts[pv.get('url', '/')] += 1
    top_pages = sorted(page_counts.items(), key=lambda x: x[1], reverse=True)[:20]

    sources   = defaultdict(int)
    campaigns = defaultdict(int)
    countries = defaultdict(int)
    devices   = defaultdict(int)
    ref_domains = defaultdict(int)

    for s in sessions:
        sources[s.get('src', 'direct')] += 1
        c = s.get('utm_campaign', '')
        if c:
            campaigns[c] += 1
        co = s.get('country', '')
        if co:
            countries[co] += 1
        devices[s.get('dev', 'desktop')] += 1
        rd = s.get('refDomain', '')
        if rd:
            ref_domains[rd] += 1

    active_times = [
        e.get('p_seconds', 0) for e in events
        if e.get('name') == 'active_time' and e.get('p_seconds', 0) > 0
    ]
    avg_active = round(sum(active_times) / len(active_times)) if active_times else 0

    event_types = defaultdict(int)
    for e in events:
        event_types[e.get('name', 'unknown')] += 1

    # Подсчёт отказов (сессии с 1 просмотром)
    pv_by_sid = defaultdict(int)
    for pv in pageviews:
        pv_by_sid[pv.get('sid', '')] += 1
    bounces = sum(1 for c in pv_by_sid.values() if c == 1)

    return jsonify({
        'period_days':      days,
        'total_sessions':   len(sessions),
        'total_pageviews':  len(pageviews),
        'new_users':        sum(1 for s in sessions if s.get('isNew')),
        'returning_users':  sum(1 for s in sessions if not s.get('isNew')),
        'bounce_count':     bounces,
        'bounce_rate':      round(bounces / len(sessions) * 100, 1) if sessions else 0,
        'avg_active_sec':   avg_active,
        'top_pages':        [{'url': k, 'views': v} for k, v in top_pages],
        'sources':          dict(sources),
        'campaigns':        dict(sorted(campaigns.items(), key=lambda x: x[1], reverse=True)),
        'countries':        dict(sorted(countries.items(), key=lambda x: x[1], reverse=True)[:20]),
        'devices':          dict(devices),
        'ref_domains':      dict(sorted(ref_domains.items(), key=lambda x: x[1], reverse=True)[:15]),
        'event_types':      dict(sorted(event_types.items(), key=lambda x: x[1], reverse=True)),
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  КОГОРТНЫЙ АНАЛИЗ
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/cohorts')
def cohorts():
    """GET /cohorts?weeks=8 — когорты по неделям."""
    weeks    = int(request.args.get('weeks', 8))
    sessions = get_sessions(days=weeks * 7, limit=10000)

    week_data = defaultdict(lambda: {'new': 0, 'returning': 0, 'week_label': ''})
    for s in sessions:
        ts = s.get('ts', 0)
        if not ts:
            continue
        dt     = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        now    = datetime.now(timezone.utc)
        week_n = (now - dt).days // 7
        if week_n >= weeks:
            continue
        label = (now - timedelta(weeks=week_n)).strftime('Нед. %d %b')
        week_data[week_n]['week_label'] = label
        if s.get('isNew'):
            week_data[week_n]['new'] += 1
        else:
            week_data[week_n]['returning'] += 1

    result = []
    for week_n in sorted(week_data.keys(), reverse=True):
        row   = week_data[week_n]
        total = row['new'] + row['returning']
        result.append({
            'week':      row['week_label'],
            'new':       row['new'],
            'returning': row['returning'],
            'total':     total,
            'retention': round(row['returning'] / total * 100, 1) if total else 0
        })

    return jsonify({'weeks': weeks, 'cohorts': result})


# ═══════════════════════════════════════════════════════════════════════════════
#  ВОРОНКИ
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/funnel')
def funnel():
    """
    GET /funnel?steps=pageview,scroll_50pct,form_submit&days=30
    Воронка: для каждого шага — сколько уникальных сессий дошли до него.

    Пример шагов для URL-воронки:
      url:/,url:/services,url:/contact

    Пример шагов для событий:
      pageview,scroll_50pct,time_on_page_30s,form_submit
    """
    days      = int(request.args.get('days', 30))
    steps_raw = request.args.get('steps', 'pageview,scroll_50pct,form_submit')
    steps     = [s.strip() for s in steps_raw.split(',') if s.strip()]

    if not steps:
        return jsonify({'error': 'Укажи steps через запятую'}), 400

    sessions  = get_sessions(days)
    pageviews = get_pageviews(days)
    events    = get_events(days)

    actions_by_sid = defaultdict(set)
    for pv in pageviews:
        sid = pv.get('sid')
        if sid:
            actions_by_sid[sid].add('pageview')
            # Поддержка url:/path в шагах
            actions_by_sid[sid].add(f'url:{pv.get("url", "/")}')

    for ev in events:
        sid  = ev.get('sid')
        name = ev.get('name', '')
        if sid and name:
            actions_by_sid[sid].add(name)

    all_sids    = set(s.get('id') for s in sessions if s.get('id'))
    current_set = all_sids
    result      = []

    for step in steps:
        matched       = {sid for sid in current_set if step in actions_by_sid[sid]}
        pct_from_top  = round(len(matched) / len(all_sids) * 100, 1) if all_sids else 0
        pct_from_prev = round(len(matched) / len(current_set) * 100, 1) if current_set else 0
        result.append({
            'step':           step,
            'users':          len(matched),
            'pct_from_start': pct_from_top,
            'pct_from_prev':  pct_from_prev,
            'dropped':        len(current_set) - len(matched)
        })
        current_set = matched

    return jsonify({
        'days':        days,
        'total_users': len(all_sids),
        'steps':       result
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  ЭКСПОРТ CSV
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/export/csv')
def export_csv():
    """
    GET /export/csv?days=30&collection=sessions|pageviews|events|visits
    collection «visits» — обогащённые сессии (как в таблице посещений).
    """
    days       = int(request.args.get('days', 30))
    collection = request.args.get('collection', 'sessions')

    if collection == 'sessions':
        rows = get_sessions(days, limit=10000)
    elif collection == 'pageviews':
        rows = get_pageviews(days, limit=20000)
    elif collection == 'events':
        rows = get_events(days, limit=20000)
    elif collection == 'visits':
        # Возвращаем обогащённые сессии в плоском формате
        resp = sessions_endpoint()
        data = json.loads(resp.get_data())
        rows = data.get('sessions', [])
    else:
        return jsonify({'error': 'collection must be sessions|pageviews|events|visits'}), 400

    if not rows:
        return Response('No data', mimetype='text/plain')

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys(), extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        if 'ts' in row and row['ts']:
            row = dict(row)
            row['ts_human'] = datetime.fromtimestamp(
                row['ts'] / 1000, tz=timezone.utc
            ).strftime('%Y-%m-%d %H:%M:%S UTC')
        writer.writerow(row)

    filename = f'dc_analytics_{collection}_{days}d_{datetime.now().strftime("%Y%m%d")}.csv'
    return Response(
        '\ufeff' + output.getvalue(),   # BOM для корректного открытия в Excel
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename={filename}'}
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  ЭКСПОРТ В GOOGLE SHEETS
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/export/sheets', methods=['POST'])
def export_sheets():
    """
    POST /export/sheets
    Body (JSON): {"days": 30, "collection": "sessions"}
    """
    if not SHEETS_OK:
        return jsonify({'error': 'gspread не установлен'}), 501
    if not SHEETS_ID:
        return jsonify({'error': 'GOOGLE_SHEETS_ID не задан в env'}), 400

    body       = request.get_json() or {}
    days       = int(body.get('days', 30))
    collection = body.get('collection', 'sessions')

    if collection == 'sessions':
        rows = get_sessions(days, limit=10000)
    elif collection == 'pageviews':
        rows = get_pageviews(days, limit=20000)
    elif collection == 'events':
        rows = get_events(days, limit=20000)
    else:
        return jsonify({'error': 'collection must be sessions|pageviews|events'}), 400

    if not rows:
        return jsonify({'error': 'Нет данных'}), 404

    try:
        sa_env  = os.environ.get('FIREBASE_SERVICE_ACCOUNT')
        sa_info = json.loads(sa_env)
        creds   = SACredentials.from_service_account_info(
            sa_info,
            scopes=['https://www.googleapis.com/auth/spreadsheets']
        )
        gc = gspread.authorize(creds)
        sh = gc.open_by_key(SHEETS_ID)

        sheet_name = f'{collection}_{days}d'
        try:
            ws = sh.worksheet(sheet_name)
            ws.clear()
        except gspread.WorksheetNotFound:
            ws = sh.add_worksheet(title=sheet_name, rows='10000', cols='30')

        headers = list(rows[0].keys())
        data    = [headers]
        for row in rows:
            ts = row.get('ts', 0)
            if ts:
                row = dict(row)
                row['ts_human'] = datetime.fromtimestamp(
                    ts / 1000, tz=timezone.utc
                ).strftime('%Y-%m-%d %H:%M:%S')
            data.append([str(row.get(h, '')) for h in headers])

        ws.update(data)
        return jsonify({'ok': True, 'sheet': sheet_name, 'rows': len(rows)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════════════
#  HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/health')
def health():
    return jsonify({
        'ok':        True,
        'version':   '3.1',
        'geoip_db':  os.path.exists(GEOIP_DB),
        'sheets_ok': SHEETS_OK,
        'project':   PROJECT_ID
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  ЗАПУСК
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
