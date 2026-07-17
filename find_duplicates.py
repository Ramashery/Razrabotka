# -*- coding: utf-8 -*-
"""
find_duplicates.py — ВРЕМЕННЫЙ модуль.

Работает ВНУТРИ сборки на GitHub Actions (у раннера есть интернет — в
отличие от телефона/локальной проверки), поэтому вы ничего не запускаете
сами: просто открываете https://digital-craft-tbilisi.site/dubli/ в
браузере ПОСЛЕ того, как деплой завершится.

Что делает:
  1. Забирает /sitemap.xml с уже ЖИВОГО сайта (та версия, что была
     задеплоена до этого коммита) — список "правильных" canonical URL.
  2. Для каждого canonical URL строит типовые варианты-дубли:
       ?                      (пустой query)
       ?utm_source=...        (метки рекламы/аналитики)
       ?fbclid=...            (метка Facebook)
       без слэша в конце
       /index.html            (тот же файл под другим путём)
       http:// вместо https://
       www.digital-craft-tbilisi.site
       /RU/... (заглавный код языка)
  3. Реально запрашивает каждый вариант и определяет:
       - редиректит ли сервер на canonical (это ок, ничего делать не надо);
       - либо отдаёт 200 с ИДЕНТИЧНЫМ содержимым сам, без редиректа —
         это и есть реальный риск дубля для Google;
       - либо 404 — не проблема.
  4. Рендерит HTML-отчёт на /dubli/ (noindex, нигде на сайте не
     залинкован) с готовыми рекомендациями, что добавить в robots.txt.

Если по какой-то причине сеть недоступна или sitemap не отдаётся —
функция не должна ронять сборку сайта: при любой ошибке она просто
пишет страницу с сообщением об ошибке и завершает работу.

--------------------------------------------------------------------------
КАК ПОДКЛЮЧИТЬ (временно), если ещё не подключено:

  В generate_site.py, в начало файла:
      from find_duplicates import generate_duplicates_page

  В main(), сразу после generate_sitemap_xml(...):
      generate_duplicates_page(all_data, OUTPUT_DIR, BASE_URL)

КАК УДАЛИТЬ, когда всё разобрано:
  - убрать импорт и вызов generate_duplicates_page(...) из generate_site.py;
  - удалить сам файл find_duplicates.py;
  - закоммитить — страница /dubli/ перестанет генерироваться и исчезнет
    с сайта после следующего деплоя (rmtree(OUTPUT_DIR) в начале
    generate_site.py чистит всю папку public/ перед каждой сборкой).
--------------------------------------------------------------------------
"""

import os
import re
import html
import hashlib
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlsplit, urlunsplit

try:
    import requests
except ImportError:
    requests = None

USER_AGENT = "Mozilla/5.0 (compatible; DuplicateURLChecker/1.0; +https://digital-craft-tbilisi.site/)"
CANONICAL_RE = re.compile(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', re.IGNORECASE)
REQUEST_TIMEOUT = 10
MAX_WORKERS = 8
MAX_PAGES_TO_CHECK = 200  # защита от слишком долгой сборки на очень большом сайте


def _fetch_live_sitemap_urls(base_url):
    resp = requests.get(f"{base_url.rstrip('/')}/sitemap.xml", headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [loc.text.strip() for loc in root.findall(".//sm:url/sm:loc", ns) if loc.text]
    if not urls:
        urls = [el.text.strip() for el in root.iter() if el.tag.endswith("loc") and el.text]
    return urls


def _build_variants(url):
    parts = urlsplit(url)
    variants = {}

    variants["trailing_question_mark"] = url + "?"
    variants["utm_params"] = url + "?utm_source=test&utm_medium=test&utm_campaign=dupcheck"
    variants["fbclid"] = url + "?fbclid=IwTestDuplicateCheck123"

    if parts.path.endswith("/") and parts.path != "/":
        variants["no_trailing_slash"] = urlunsplit((parts.scheme, parts.netloc, parts.path[:-1], "", ""))
        variants["index_html"] = urlunsplit((parts.scheme, parts.netloc, parts.path + "index.html", "", ""))

    if parts.scheme == "https":
        variants["http_variant"] = urlunsplit(("http", parts.netloc, parts.path, "", ""))

    if not parts.netloc.startswith("www."):
        variants["www_variant"] = urlunsplit((parts.scheme, "www." + parts.netloc, parts.path, "", ""))

    segments = parts.path.strip("/").split("/")
    if segments and len(segments[0]) == 2:
        upper_path = "/" + "/".join([segments[0].upper()] + segments[1:]) + ("/" if parts.path.endswith("/") else "")
        variants["uppercase_lang"] = urlunsplit((parts.scheme, parts.netloc, upper_path, "", ""))

    return variants


def _content_hash(text):
    cleaned = re.sub(r'(main\.js|new-carousel\.js)\?v=[a-f0-9]+', r'\1', text)
    return hashlib.sha256(cleaned.encode("utf-8", errors="ignore")).hexdigest()


def _fetch(url, session):
    try:
        return session.get(url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT, allow_redirects=True), None
    except requests.RequestException as e:
        return None, str(e)


def _check_one_url(canonical_url, session):
    rows = []
    base_resp, err = _fetch(canonical_url, session)
    if err or base_resp is None or base_resp.status_code != 200:
        return rows  # canonical сам недоступен — пропускаем молча, это не тема отчёта о дублях

    base_hash = _content_hash(base_resp.text)

    for variant_type, variant_url in _build_variants(canonical_url).items():
        resp, err = _fetch(variant_url, session)
        row = {
            "canonical_url": canonical_url,
            "variant_type": variant_type,
            "variant_url": variant_url,
            "status": "ERROR" if err else resp.status_code,
            "level": "ok",
            "note": "",
        }
        if err or resp is None:
            row["note"] = f"ошибка запроса: {err}"
        elif resp.status_code == 404:
            row["note"] = "404 — не проиндексируется"
        elif len(resp.history) > 0:
            final_url = resp.url
            if final_url.rstrip("/") == canonical_url.rstrip("/"):
                row["note"] = "редиректит на canonical"
            else:
                row["level"] = "risk"
                row["note"] = f"редиректит НЕ на canonical, а на {final_url}"
        elif resp.status_code == 200:
            tag_match = CANONICAL_RE.search(resp.text)
            tag = tag_match.group(1) if tag_match else None
            same_content = _content_hash(resp.text) == base_hash
            if not same_content:
                row["note"] = "контент отличается — не дубль"
            elif tag and tag.rstrip("/") == canonical_url.rstrip("/"):
                row["level"] = "risk"
                row["note"] = "отдаётся напрямую (200, без редиректа), canonical-тег верный, но Google может всё равно проиндексировать этот URL отдельно"
            else:
                row["level"] = "critical"
                row["note"] = "200, тот же контент, canonical-тег отсутствует или указывает не туда — настоящий дубль"
        else:
            row["note"] = f"статус {resp.status_code}"
        rows.append(row)
    return rows


def _esc(s):
    return html.escape(str(s or ''))


def _render_report(all_rows, base_url, checked_count, truncated, error_message=None):
    parts = ['''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Отчёт о дублях URL (временная служебная страница)</title>
<style>
body{font-family:system-ui,Arial,sans-serif;max-width:900px;margin:1.5rem auto;padding:0 1rem;line-height:1.5;color:#222}
h1{font-size:1.3rem} h2{margin-top:2.2rem;border-bottom:2px solid #ddd;padding-bottom:.3rem;font-size:1.1rem}
.group{border:1px solid #ddd;border-radius:8px;padding:.8rem 1rem;margin:.8rem 0;background:#fafafa;word-break:break-all}
.group.risk{border-color:#b8860b;background:#fff8e6}
.group.critical{border-color:#c0392b;background:#fdf1f0}
.badge{display:inline-block;font-size:.75em;font-weight:bold;padding:.1rem .5rem;border-radius:4px;color:#fff;margin-right:.4rem}
.badge.risk{background:#b8860b} .badge.critical{background:#c0392b} .badge.ok{background:#1a7f37}
code{background:#eee;padding:.1rem .3rem;border-radius:4px;font-size:.85em}
.canon{color:#555;font-size:.85em;margin-bottom:.3rem}
.empty{color:#888;font-style:italic}
.summary{background:#eef;border-radius:8px;padding:1rem;margin:1rem 0}
pre{white-space:pre-wrap;background:#eee;padding:.6rem;border-radius:6px;font-size:.85em}
</style>
</head>
<body>
<h1>Служебный отчёт о дублях URL</h1>
<p>Страница временная, не индексируется (<code>noindex</code>), нигде на сайте не залинкована.
Проверялся живой сайт <code>''' + _esc(base_url) + '''</code> на типовые URL-варианты
(<code>?</code>, <code>?utm_source</code>, <code>?fbclid</code>, без слэша, <code>index.html</code>,
<code>http://</code>, <code>www.</code>, заглавный код языка).
Удалить вместе со скриптом <code>find_duplicates.py</code>, когда всё разобрано.</p>
''']

    if error_message:
        parts.append(f'<div class="group critical"><b>Проверка не выполнена:</b><br><pre>{_esc(error_message)}</pre>'
                      f'<p>Обычно это значит, что раннеру GitHub Actions не удалось достучаться до '
                      f'<code>{_esc(base_url)}/sitemap.xml</code> (сайт ещё не задеплоен впервые, либо временный сбой сети). '
                      f'Попробуйте перезапустить workflow.</p></div>')
        parts.append('</body></html>')
        return ''.join(parts)

    critical = [r for r in all_rows if r["level"] == "critical"]
    risk = [r for r in all_rows if r["level"] == "risk"]
    ok = [r for r in all_rows if r["level"] == "ok"]

    parts.append(f'''<div class="summary">
Проверено страниц: {checked_count}{" (ограничено первыми " + str(MAX_PAGES_TO_CHECK) + ")" if truncated else ""}<br>
🔴 Критично: {len(critical)} &nbsp; ⚠ Риск: {len(risk)} &nbsp; ✅ Ок: {len(ok)}
</div>''')

    def render_group(rows, level, title, empty_text):
        parts.append(f'<h2>{title}</h2>')
        if not rows:
            parts.append(f'<p class="empty">{empty_text}</p>')
            return
        by_canon = {}
        for r in rows:
            by_canon.setdefault(r["canonical_url"], []).append(r)
        for canon_url, group_rows in by_canon.items():
            parts.append(f'<div class="group {level}"><div class="canon">Страница: <a href="{_esc(canon_url)}">{_esc(canon_url)}</a></div>')
            for r in group_rows:
                parts.append(f'<div><span class="badge {level}">{_esc(r["variant_type"])}</span>'
                              f'<a href="{_esc(r["variant_url"])}">{_esc(r["variant_url"])}</a> — {_esc(r["note"])}</div>')
            parts.append('</div>')

    render_group(critical, "critical", "🔴 Критично — настоящие дубли (действовать в первую очередь)", "Не найдено.")
    render_group(risk, "risk", "⚠ Риск — отдаются напрямую (200) без редиректа, но canonical-тег на месте", "Не найдено.")

    if critical or risk:
        parts.append('''<h2>Что делать</h2>
<div class="group">
<p>GitHub Pages — статический хостинг, он физически не умеет делать серверный редирект
по query-параметрам (<code>?utm=...</code>, <code>?fbclid=...</code> и т.п.) — файл отдаётся
один и тот же независимо от «?». Поэтому «настроить редирект» тут в привычном смысле нельзя.
Рабочие меры:</p>
<ol>
<li>В <code>robots.txt</code> добавить строку:<br><code>Disallow: /*?</code></li>
<li>Если есть дубли <code>index.html</code> — добавить:<br><code>Disallow: /*/index.html$</code></li>
<li>Уже проиндексированные Google URL из списка выше — убрать вручную через
<b>Google Search Console → Удаления → Временное скрытие URL</b> (по каждому конкретно).</li>
<li>Убедиться, что self-canonical тег есть на каждой странице (для критичных ниже он либо
отсутствует, либо указывает не туда — это и есть основная причина дубля).</li>
</ol>
</div>''')

    parts.append('</body></html>')
    return ''.join(parts)


def generate_duplicates_page(all_data, output_dir, base_url):
    print("--- [ВРЕМЕННО] Генерация отчёта о дублях URL /dubli ---")
    dubli_dir = os.path.join(output_dir, 'dubli')
    os.makedirs(dubli_dir, exist_ok=True)
    out_path = os.path.join(dubli_dir, 'index.html')

    if requests is None:
        html_out = _render_report([], base_url, 0, False, error_message="Модуль 'requests' не установлен (нет в requirements.txt).")
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(html_out)
        print("✗ 'requests' не установлен — отчёт не сформирован.")
        return

    try:
        urls = _fetch_live_sitemap_urls(base_url)
        truncated = len(urls) > MAX_PAGES_TO_CHECK
        urls = urls[:MAX_PAGES_TO_CHECK]

        all_rows = []
        session = requests.Session()
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {pool.submit(_check_one_url, u, session): u for u in urls}
            for fut in as_completed(futures):
                all_rows.extend(fut.result())

        html_out = _render_report(all_rows, base_url, len(urls), truncated)
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(html_out)

        critical = sum(1 for r in all_rows if r["level"] == "critical")
        risk = sum(1 for r in all_rows if r["level"] == "risk")
        print(f"✓ Отчёт создан: {out_path} (проверено страниц: {len(urls)}, критично: {critical}, риск: {risk})")

    except Exception as e:
        html_out = _render_report([], base_url, 0, False, error_message=str(e))
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(html_out)
        print(f"✗ ОШИБКА при генерации отчёта о дублях: {e}")
