"""
dc_backend.py — Digital Craft Tbilisi Analytics Backend
========================================================
Функции:
  GET  /geo?sid=SESSION_ID   — определяет страну по IP, пишет в Firestore
  GET  /report               — сводный отчёт по сессиям/событиям
  GET  /cohorts              — когортный анализ (новые vs вернувшиеся по неделям)
  GET  /funnel               — воронка по заданным событиям
  GET  /export/csv           — экспорт всех данных в CSV
  POST /export/sheets        — экспорт в Google Sheets

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
import geoip2.database          # pip install geoip2
import requests                 # pip install requests

# ─── Опционально: Google Sheets ────────────────────────────────────────────
try:
    import gspread
    from google.oauth2.service_account import Credentials as SACredentials
    SHEETS_OK = True
except ImportError:
    SHEETS_OK = False

app = Flask(__name__)
CORS(app, origins=[
    'https://digital-craft-tbilisi.site',
    'http://localhost:*',
    'http://127.0.0.1:*'
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

# GeoIP (MaxMind GeoLite2 — бесплатно после регистрации на maxmind.com)
geo_reader = None
if os.path.exists(GEOIP_DB):
    geo_reader = geoip2.database.Reader(GEOIP_DB)

# ═══════════════════════════════════════════════════════════════════════════════
#  FIRESTORE HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def get_sessions(days=30, limit=5000):
    """Загружает сессии за последние N дней."""
    cutoff = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp() * 1000)
    docs = (db.collection('analytics_sessions')
              .where('ts', '>=', cutoff)
              .order_by('ts', direction=firestore.Query.DESCENDING)
              .limit(limit)
              .stream())
    return [d.to_dict() | {'_doc_id': d.id} for d in docs]

def get_pageviews(days=30, limit=10000):
    cutoff = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp() * 1000)
    docs = (db.collection('analytics_pageviews')
              .where('ts', '>=', cutoff)
              .order_by('ts', direction=firestore.Query.DESCENDING)
              .limit(limit)
              .stream())
    return [d.to_dict() for d in docs]

def get_events(days=30, limit=10000):
    cutoff = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp() * 1000)
    docs = (db.collection('analytics_events')
              .where('ts', '>=', cutoff)
              .order_by('ts', direction=firestore.Query.DESCENDING)
              .limit(limit)
              .stream())
    return [d.to_dict() for d in docs]

def patch_session(doc_id, data):
    """Дописывает поля в существующую запись сессии."""
    db.collection('analytics_sessions').document(doc_id).update(data)

def find_session_by_sid(sid):
    """Ищет документ сессии по полю id."""
    docs = db.collection('analytics_sessions').where('id', '==', sid).limit(1).stream()
    for d in docs:
        return d.id  # возвращаем doc_id Firestore
    return None

# ═══════════════════════════════════════════════════════════════════════════════
#  IP-ГЕОЛОКАЦИЯ
# ═══════════════════════════════════════════════════════════════════════════════

def get_ip():
    """Определяет реальный IP клиента (учитывает прокси/CDN)."""
    for header in ('X-Forwarded-For', 'X-Real-IP', 'CF-Connecting-IP'):
        val = request.headers.get(header)
        if val:
            return val.split(',')[0].strip()
    return request.remote_addr

def lookup_geo(ip):
    """Возвращает {'country': ..., 'city': ..., 'region': ...} по IP."""
    if not geo_reader:
        # Fallback: бесплатный публичный API (медленнее, лимит 45 req/мин)
        try:
            r = requests.get(f'http://ip-api.com/json/{ip}?fields=country,regionName,city',
                             timeout=3)
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

    try:
        rec = geo_reader.city(ip)
        return {
            'country': rec.country.name or '',
            'city':    rec.city.name or '',
            'region':  rec.subdivisions.most_specific.name or ''
        }
    except Exception:
        return {'country': '', 'city': '', 'region': ''}

@app.route('/geo')
def geo_endpoint():
    """
    Трекер вызывает: GET /geo?sid=SESSION_ID
    Бэкенд определяет IP → страна → пишет в Firestore сессию.
    """
    sid = request.args.get('sid', '')
    ip  = get_ip()
    geo = lookup_geo(ip)

    if sid and geo.get('country'):
        # Retry: сессия может ещё не успеть записаться в Firestore
        doc_id = None
        for attempt in range(4):
            doc_id = find_session_by_sid(sid)
            if doc_id:
                break
            if attempt < 3:
                import time
                time.sleep(1.5)

        if doc_id:
            try:
                patch_session(doc_id, {
                    'country': geo['country'],
                    'city':    geo['city'],
                    'region':  geo['region'],
                    'ip_hash': str(abs(hash(ip)) % 10**8)
                })
                app.logger.info(f'geo patched: sid={sid} country={geo["country"]}')
            except Exception as e:
                app.logger.error(f'patch_session error: {e}')
        else:
            # Сессия не найдена — пишем геолокацию отдельным документом
            try:
                db.collection('analytics_geo').add({
                    'sid':     sid,
                    'ts':      int(datetime.now(timezone.utc).timestamp() * 1000),
                    'country': geo['country'],
                    'city':    geo['city'],
                    'region':  geo['region'],
                    'ip_hash': str(abs(hash(ip)) % 10**8)
                })
                app.logger.warning(f'geo saved separately: sid={sid} (session not found)')
            except Exception as e:
                app.logger.error(f'geo fallback error: {e}')

    return jsonify(geo)

# ═══════════════════════════════════════════════════════════════════════════════
#  ОТЧЁТЫ
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/report')
def report():
    """
    GET /report?days=30
    Сводный отчёт: сессии, просмотры, топ страниц, источники, устройства,
    UTM-кампании, страны, активное время.
    """
    days     = int(request.args.get('days', 30))
    sessions = get_sessions(days)
    pageviews = get_pageviews(days)
    events    = get_events(days)

    # Топ страниц
    page_counts = defaultdict(int)
    for pv in pageviews:
        page_counts[pv.get('url', '/')] += 1
    top_pages = sorted(page_counts.items(), key=lambda x: x[1], reverse=True)[:20]

    # Источники
    sources = defaultdict(int)
    for s in sessions:
        sources[s.get('src', 'direct')] += 1

    # UTM кампании
    campaigns = defaultdict(int)
    for s in sessions:
        c = s.get('utm_campaign', '')
        if c:
            campaigns[c] += 1

    # Страны
    countries = defaultdict(int)
    for s in sessions:
        c = s.get('country', '')
        if c:
            countries[c] += 1

    # Устройства
    devices = defaultdict(int)
    for s in sessions:
        devices[s.get('dev', 'desktop')] += 1

    # Referrer домены
    ref_domains = defaultdict(int)
    for s in sessions:
        rd = s.get('refDomain', '')
        if rd:
            ref_domains[rd] += 1

    # Среднее активное время (из событий active_time)
    active_times = [
        e.get('p_seconds', 0) for e in events
        if e.get('name') == 'active_time' and e.get('p_seconds', 0) > 0
    ]
    avg_active = round(sum(active_times) / len(active_times)) if active_times else 0

    # Клики по типам
    event_types = defaultdict(int)
    for e in events:
        event_types[e.get('name', 'unknown')] += 1

    return jsonify({
        'period_days':    days,
        'total_sessions': len(sessions),
        'total_pageviews': len(pageviews),
        'new_users':      sum(1 for s in sessions if s.get('isNew')),
        'returning_users': sum(1 for s in sessions if not s.get('isNew')),
        'avg_active_sec': avg_active,
        'top_pages':      [{'url': k, 'views': v} for k, v in top_pages],
        'sources':        dict(sources),
        'campaigns':      dict(sorted(campaigns.items(), key=lambda x: x[1], reverse=True)),
        'countries':      dict(sorted(countries.items(), key=lambda x: x[1], reverse=True)[:20]),
        'devices':        dict(devices),
        'ref_domains':    dict(sorted(ref_domains.items(), key=lambda x: x[1], reverse=True)[:15]),
        'event_types':    dict(sorted(event_types.items(), key=lambda x: x[1], reverse=True)),
    })

# ═══════════════════════════════════════════════════════════════════════════════
#  КОГОРТНЫЙ АНАЛИЗ
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/cohorts')
def cohorts():
    """
    GET /cohorts?weeks=8
    Когорты по неделям: сколько новых пользователей пришло,
    сколько вернулось на следующей неделе.
    """
    weeks    = int(request.args.get('weeks', 8))
    sessions = get_sessions(days=weeks * 7, limit=10000)

    # Группируем сессии по неделям
    week_data = defaultdict(lambda: {'new': 0, 'returning': 0, 'week_label': ''})
    for s in sessions:
        ts = s.get('ts', 0)
        if not ts:
            continue
        dt      = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        # Номер недели: 0 = текущая, 1 = прошлая, ...
        now     = datetime.now(timezone.utc)
        week_n  = (now - dt).days // 7
        if week_n >= weeks:
            continue
        label   = (now - timedelta(weeks=week_n)).strftime('Нед. %d %b')
        week_data[week_n]['week_label'] = label
        if s.get('isNew'):
            week_data[week_n]['new'] += 1
        else:
            week_data[week_n]['returning'] += 1

    result = []
    for week_n in sorted(week_data.keys(), reverse=True):
        row = week_data[week_n]
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
    Воронка: для каждого шага считаем уникальных пользователей,
    которые дошли до него после предыдущего.

    Пример шагов:
      pageview,scroll_50pct,button_click,form_submit
    """
    days       = int(request.args.get('days', 30))
    steps_raw  = request.args.get('steps', 'pageview,scroll_50pct,form_submit')
    steps      = [s.strip() for s in steps_raw.split(',') if s.strip()]

    if not steps:
        return jsonify({'error': 'Укажи steps через запятую'}), 400

    sessions  = get_sessions(days)
    pageviews = get_pageviews(days)
    events    = get_events(days)

    # Собираем все действия по sid
    actions_by_sid = defaultdict(set)

    for pv in pageviews:
        sid = pv.get('sid')
        if sid:
            actions_by_sid[sid].add('pageview')

    for ev in events:
        sid  = ev.get('sid')
        name = ev.get('name', '')
        if sid and name:
            actions_by_sid[sid].add(name)

    # Воронка: последовательный фильтр
    all_sids    = set(s.get('id') for s in sessions if s.get('id'))
    current_set = all_sids
    result      = []

    for step in steps:
        matched = {sid for sid in current_set if step in actions_by_sid[sid]}
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
        'days':         days,
        'total_users':  len(all_sids),
        'steps':        result
    })

# ═══════════════════════════════════════════════════════════════════════════════
#  ЭКСПОРТ CSV
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/export/csv')
def export_csv():
    """
    GET /export/csv?days=30&collection=sessions
    collection: sessions | pageviews | events
    """
    days       = int(request.args.get('days', 30))
    collection = request.args.get('collection', 'sessions')

    if collection == 'sessions':
        rows = get_sessions(days, limit=10000)
    elif collection == 'pageviews':
        rows = get_pageviews(days, limit=20000)
    elif collection == 'events':
        rows = get_events(days, limit=20000)
    else:
        return jsonify({'error': 'collection must be sessions|pageviews|events'}), 400

    if not rows:
        return Response('No data', mimetype='text/plain')

    output  = io.StringIO()
    writer  = csv.DictWriter(output, fieldnames=rows[0].keys(), extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        # Конвертируем timestamp в читаемую дату
        if 'ts' in row and row['ts']:
            row = dict(row)
            row['ts_human'] = datetime.fromtimestamp(
                row['ts'] / 1000, tz=timezone.utc
            ).strftime('%Y-%m-%d %H:%M:%S UTC')
        writer.writerow(row)

    filename = f'dc_analytics_{collection}_{days}d_{datetime.now().strftime("%Y%m%d")}.csv'
    return Response(
        output.getvalue(),
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

    Требует:
      - GOOGLE_SHEETS_ID в env
      - gspread + google-auth: pip install gspread google-auth
      - Сервисный аккаунт должен иметь доступ к таблице (Editor)
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
        sa_env = os.environ.get('FIREBASE_SERVICE_ACCOUNT')
        sa_info = json.loads(sa_env)
        creds  = SACredentials.from_service_account_info(
            sa_info,
            scopes=['https://www.googleapis.com/auth/spreadsheets']
        )
        gc     = gspread.authorize(creds)
        sh     = gc.open_by_key(SHEETS_ID)

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
        return jsonify({
            'ok':    True,
            'sheet': sheet_name,
            'rows':  len(rows)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ═══════════════════════════════════════════════════════════════════════════════
#  HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/health')
def health():
    return jsonify({
        'ok':        True,
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
