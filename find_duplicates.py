# -*- coding: utf-8 -*-
"""
find_duplicates.py — ВРЕМЕННЫЙ скрипт.

Цель: пройтись по контенту, который generate_site.py тянет из Firestore
(services, portfolio, blog, contact), найти:
  1) ТОЧНЫЕ дубли — разные документы с полностью совпадающим (после
     нормализации) title+subtitle+description(+content);
  2) ПОЧТИ-дубли — тексты, совпадающие более чем на 85% (SequenceMatcher);
  3) КОНФЛИКТЫ URL — разные документы, у которых из-за slugify() совпали
     lang + collection_name + urlSlug (при сборке один файл перезапишет
     другой — это баг, а не просто SEO-дубль, чинить надо сразу).

Результат — страница /dubli/index.html на сайте (со <meta name="robots"
content="noindex,nofollow">, чтобы Google её не проиндексировал) со списком
дублей и предлагаемым canonical-URL для каждой группы, на который стоит
сделать редирект.

--------------------------------------------------------------------------
КАК ПОДКЛЮЧИТЬ (временно):

1. Положите этот файл рядом с generate_site.py (корень репозитория).

2. В generate_site.py добавьте импорт в начало файла:

       from find_duplicates import generate_duplicates_page

   и один вызов в конце main(), сразу после generate_sitemap_xml(...):

       generate_duplicates_page(all_data, OUTPUT_DIR, BASE_URL)

3. Закоммитьте и запушьте — GitHub Actions пересоберёт сайт, и на
   https://digital-craft-tbilisi.site/dubli/ появится отчёт.

4. Настройте нужные редиректы на canonical-URL (см. подсказки на странице
   и файл public/dubli/redirects.txt — он же копируется в public при сборке).

5. КАК УДАЛИТЬ, когда всё готово:
   - удалить строку импорта и вызов generate_duplicates_page(...) из
     generate_site.py;
   - удалить сам файл find_duplicates.py;
   - закоммитить — страница /dubli/ перестанет генерироваться и после
     следующего деплоя пропадёт с сайта (не забудьте, что сама папка
     /dubli/ была ранее в 'ignore' у copy_static_assets — она не входит
     туда специально, чтобы прошлые версии подчистились rmtree(OUTPUT_DIR)
     в начале generate_site.py).
--------------------------------------------------------------------------
"""

import os
import re
import html
import hashlib
import difflib
from datetime import datetime

# Коллекции, которые реально становятся отдельными HTML-страницами.
# carouselItems сюда не входят — под них generate_detail_page не вызывается
# (см. main() в generate_site.py), это не самостоятельные страницы.
PAGE_COLLECTIONS = ['services', 'portfolio', 'blog', 'contact']

NEAR_DUP_THRESHOLD = 0.85   # порог схожести текста для "почти дубля"
MIN_TEXT_LEN_FOR_NEAR = 40  # не сравнивать совсем короткие тексты (шум)


def _normalize_text(item):
    """Склеивает основные текстовые поля документа и приводит к виду,
    удобному для сравнения: без HTML-тегов, знаков препинания, регистра."""
    parts = [
        item.get('title') or '',
        item.get('subtitle') or '',
        item.get('description') or '',
        item.get('content') or '',
    ]
    text = ' '.join(str(p) for p in parts if p)
    text = re.sub(r'<[^>]+>', ' ', text)          # снять HTML-теги
    text = html.unescape(text)
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text, flags=re.UNICODE)
    text = re.sub(r'\s+', ' ', text, flags=re.UNICODE).strip()
    return text


def _page_url(item, base_url):
    return f"{base_url}/{item.get('lang')}/{item.get('collection_name')}/{item.get('urlSlug')}/"


def _parse_date(item):
    raw = item.get('lastModified')
    if raw:
        try:
            return datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
        except ValueError:
            pass
    return datetime.max  # нет даты — считаем "самым новым", не приоритетным


def _pick_canonical(items):
    """Канонической считаем страницу с явной галочкой isXDefault, иначе —
    с самой ранней lastModified (обычно это оригинал, а не более поздняя
    копия/переезд на новый slug)."""
    for it in items:
        if it.get('isXDefault') is True:
            return it
    return sorted(items, key=_parse_date)[0]


def _collect_items(all_data):
    items = []
    for col in PAGE_COLLECTIONS:
        for item in all_data.get(col, []):
            if item.get('urlSlug') and item.get('lang'):
                items.append(item)
    return items


def _find_url_collisions(items):
    """Документы, у которых из-за транслитерации/slugify совпал
    итоговый (lang, collection, urlSlug) — при сборке один файл затрёт
    другой. Это критично и не имеет отношения к SEO-дублям как таковым."""
    by_key = {}
    for it in items:
        key = (it.get('lang'), it.get('collection_name'), it.get('urlSlug'))
        by_key.setdefault(key, []).append(it)
    return {k: v for k, v in by_key.items() if len(v) > 1}


def _find_exact_duplicates(items):
    by_hash = {}
    for it in items:
        text = _normalize_text(it)
        if not text:
            continue
        h = hashlib.md5(text.encode('utf-8')).hexdigest()
        by_hash.setdefault((it.get('lang'), h), []).append(it)
    return [group for group in by_hash.values() if len(group) > 1]


def _find_near_duplicates(items, already_grouped_ids):
    """Попарное сравнение текстов внутри одного языка. Пары, которые уже
    попали в группу точных дублей, пропускаем."""
    by_lang = {}
    for it in items:
        by_lang.setdefault(it.get('lang'), []).append(it)

    pairs = []
    for lang, lang_items in by_lang.items():
        texts = [(_normalize_text(it), it) for it in lang_items]
        texts = [(t, it) for t, it in texts if len(t) >= MIN_TEXT_LEN_FOR_NEAR]
        n = len(texts)
        for i in range(n):
            for j in range(i + 1, n):
                a_text, a_item = texts[i]
                b_text, b_item = texts[j]
                if a_item.get('id') in already_grouped_ids and b_item.get('id') in already_grouped_ids:
                    continue
                ratio = difflib.SequenceMatcher(None, a_text, b_text).ratio()
                if ratio >= NEAR_DUP_THRESHOLD:
                    pairs.append((ratio, a_item, b_item))
    return sorted(pairs, key=lambda p: -p[0])


def _esc(s):
    return html.escape(str(s or ''))


def generate_duplicates_page(all_data, output_dir, base_url):
    print("--- [ВРЕМЕННО] Генерация отчёта о дублях /dubli ---")
    try:
        items = _collect_items(all_data)

        collisions = _find_url_collisions(items)
        exact_groups = _find_exact_duplicates(items)
        exact_ids = {it.get('id') for group in exact_groups for it in group}
        near_pairs = _find_near_duplicates(items, exact_ids)

        html_parts = ['''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex,nofollow">
<title>Отчёт о дублях (временная служебная страница)</title>
<style>
body{font-family:system-ui,Arial,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#222}
h1{font-size:1.4rem} h2{margin-top:2.5rem;border-bottom:2px solid #ddd;padding-bottom:.3rem}
.group{border:1px solid #ddd;border-radius:8px;padding:1rem;margin:1rem 0;background:#fafafa}
.group.critical{border-color:#c0392b;background:#fdf1f0}
.canon{font-weight:bold;color:#1a7f37}
.dup{color:#333}
code{background:#eee;padding:.1rem .3rem;border-radius:4px}
.ratio{color:#888;font-size:.85em}
.empty{color:#888;font-style:italic}
</style>
</head>
<body>
<h1>Служебный отчёт о дублях страниц</h1>
<p>Страница временная, не индексируется (<code>noindex</code>), нигде на сайте не залинкована.
Удалить вместе со скриптом <code>find_duplicates.py</code> после настройки редиректов.</p>
''']

        # 1. Критичные коллизии URL
        html_parts.append('<h2>1. Конфликты URL (критично — перезаписывают друг друга при сборке)</h2>')
        if collisions:
            for (lang, col, slug), group in collisions.items():
                html_parts.append('<div class="group critical">')
                html_parts.append(f'<p>URL <code>/{_esc(lang)}/{_esc(col)}/{_esc(slug)}/</code> — {len(group)} документов с одинаковым itemом:</p><ul>')
                for it in group:
                    html_parts.append(f'<li>id=<code>{_esc(it.get("id"))}</code> — «{_esc(it.get("title"))}»</li>')
                html_parts.append('</ul></div>')
        else:
            html_parts.append('<p class="empty">Не найдено.</p>')

        # 2. Точные дубли контента
        html_parts.append('<h2>2. Точные дубли контента (разные URL, одинаковый текст)</h2>')
        if exact_groups:
            for group in exact_groups:
                canonical = _pick_canonical(group)
                html_parts.append('<div class="group">')
                for it in group:
                    url = _page_url(it, base_url)
                    label = 'CANONICAL →' if it is canonical else 'дубль → редирект на canonical:'
                    css = 'canon' if it is canonical else 'dup'
                    html_parts.append(f'<p class="{css}">{label} <a href="{_esc(url)}">{_esc(url)}</a> '
                                       f'<span class="ratio">(id={_esc(it.get("id"))})</span></p>')
                html_parts.append('</div>')
        else:
            html_parts.append('<p class="empty">Не найдено.</p>')

        # 3. Почти-дубли
        html_parts.append(f'<h2>3. Похожий контент (≥{int(NEAR_DUP_THRESHOLD*100)}% совпадения текста) — проверить вручную</h2>')
        if near_pairs:
            for ratio, a, b in near_pairs:
                url_a, url_b = _page_url(a, base_url), _page_url(b, base_url)
                html_parts.append('<div class="group">')
                html_parts.append(f'<p class="ratio">Схожесть: {ratio*100:.0f}%</p>')
                html_parts.append(f'<p><a href="{_esc(url_a)}">{_esc(url_a)}</a></p>')
                html_parts.append(f'<p><a href="{_esc(url_b)}">{_esc(url_b)}</a></p>')
                html_parts.append('</div>')
        else:
            html_parts.append('<p class="empty">Не найдено.</p>')

        html_parts.append('</body></html>')

        dubli_dir = os.path.join(output_dir, 'dubli')
        os.makedirs(dubli_dir, exist_ok=True)
        with open(os.path.join(dubli_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(''.join(html_parts))

        # Плоский список редиректов "откуда -> куда" — удобно для настройки
        # 301-редиректов (Cloudflare Redirect Rules / _redirects / meta-refresh).
        redirect_lines = []
        for group in exact_groups:
            canonical_url = _page_url(_pick_canonical(group), base_url)
            for it in group:
                url = _page_url(it, base_url)
                if url != canonical_url:
                    redirect_lines.append(f'{url} -> {canonical_url}')
        with open(os.path.join(dubli_dir, 'redirects.txt'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(redirect_lines) if redirect_lines else '# Точных дублей не найдено\n')

        print(f"✓ Отчёт создан: {dubli_dir}/index.html "
              f"(конфликтов URL: {len(collisions)}, точных дублей: {len(exact_groups)}, похожих пар: {len(near_pairs)})")

    except Exception as e:
        print(f"✗ ОШИБКА при генерации отчёта о дублях: {e}")
