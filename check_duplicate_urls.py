# -*- coding: utf-8 -*-
"""
check_duplicate_urls.py — ВРЕМЕННЫЙ скрипт. Запускается вручную, локально
(с машины, у которой ЕСТЬ доступ в интернет), НЕ встраивается в
generate_site.py и НЕ входит в деплой.

Что делает:
  1. Забирает /sitemap.xml с ЖИВОГО сайта — это список "правильных" (canonical) URL.
  2. Для каждого canonical URL строит типовые варианты-дубли, которые Google
     мог проиндексировать отдельно:
       - trailing_question_mark   .../seo/?
       - utm_params               .../seo/?utm_source=test&utm_medium=test
       - fbclid                   .../seo/?fbclid=xxxxx
       - no_trailing_slash        .../seo   (без слэша)
       - index_html               .../seo/index.html
       - http_variant             http://   вместо https://
       - www_variant              www.digital-craft-tbilisi.site
       - uppercase_lang           /RU/services/seo/  вместо /ru/...
  3. Запрашивает каждый вариант и смотрит:
       - вернул ли сервер 301/302-редирект на canonical (это ХОРОШО, ничего
         делать не надо);
       - либо отдал 200 с ИДЕНТИЧНЫМ содержимым САМ, без редиректа —
         это и есть реальный дубль-риск для Google;
       - либо 404 — не проблема.
     Дополнительно вытаскивает <link rel="canonical"> со страницы-варианта,
     чтобы убедиться, что canonical-тег в принципе на месте.
  4. Пишет отчёт в duplicate_url_report.csv и печатает сводку с готовыми
     рекомендациями (что добавить в robots.txt и т.п.).

Требуется: pip install requests   (в requirements.txt проекта уже есть).

Запуск:
    python check_duplicate_urls.py
    python check_duplicate_urls.py --limit 15          # быстрый тест на 15 URL
    python check_duplicate_urls.py --workers 8          # быстрее, но агрессивнее
    python check_duplicate_urls.py --sitemap-url https://digital-craft-tbilisi.site/sitemap.xml

После того как отчёт изучен и меры приняты (robots.txt / GSC Removals /
проверка canonical) — просто удалите этот файл и duplicate_url_report.csv.
"""

import argparse
import csv
import hashlib
import re
import sys
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlsplit, urlunsplit

import requests

DEFAULT_SITEMAP_URL = "https://digital-craft-tbilisi.site/sitemap.xml"
USER_AGENT = "Mozilla/5.0 (compatible; DuplicateURLChecker/1.0; +https://digital-craft-tbilisi.site/)"
CANONICAL_RE = re.compile(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', re.IGNORECASE)
TIMEOUT = 15


def fetch_sitemap_urls(sitemap_url):
    resp = requests.get(sitemap_url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [loc.text.strip() for loc in root.findall(".//sm:url/sm:loc", ns) if loc.text]
    # на всякий случай без namespace, если он вдруг иной
    if not urls:
        urls = [loc.text.strip() for loc in root.iter() if loc.tag.endswith("loc") and loc.text]
    return urls


def build_variants(url):
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
    if segments and len(segments[0]) == 2:  # похоже на код языка (en/ru/ka/uk)
        upper_segments = [segments[0].upper()] + segments[1:]
        upper_path = "/" + "/".join(upper_segments) + ("/" if parts.path.endswith("/") else "")
        variants["uppercase_lang"] = urlunsplit((parts.scheme, parts.netloc, upper_path, "", ""))

    return variants


def _content_hash(text):
    # игнорируем query-cache-busting параметр ?v=... у main.js/new-carousel.js,
    # чтобы он не мешал сравнению (сам по себе не относится к дублю страниц)
    cleaned = re.sub(r'(main\.js|new-carousel\.js)\?v=[a-f0-9]+', r'\1', text)
    return hashlib.sha256(cleaned.encode("utf-8", errors="ignore")).hexdigest()


def fetch(url, session):
    try:
        resp = session.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT, allow_redirects=True)
        return resp, None
    except requests.RequestException as e:
        return None, str(e)


def check_one_url(canonical_url, session):
    rows = []

    base_resp, err = fetch(canonical_url, session)
    if err or base_resp is None or base_resp.status_code != 200:
        rows.append({
            "canonical_url": canonical_url, "variant_type": "(canonical сам)",
            "variant_url": canonical_url, "status": "ERROR" if err else base_resp.status_code,
            "redirected_to_canonical": "", "verdict": f"⚠ canonical сам не отдаёт 200: {err or base_resp.status_code}",
            "canonical_tag_found": "",
        })
        return rows

    base_hash = _content_hash(base_resp.text)
    base_canonical_tag = (CANONICAL_RE.search(base_resp.text) or [None, None])[1] if CANONICAL_RE.search(base_resp.text) else None

    for variant_type, variant_url in build_variants(canonical_url).items():
        resp, err = fetch(variant_url, session)
        row = {
            "canonical_url": canonical_url,
            "variant_type": variant_type,
            "variant_url": variant_url,
            "status": "ERROR" if err else resp.status_code,
            "redirected_to_canonical": "",
            "canonical_tag_found": "",
            "verdict": "",
        }
        if err or resp is None:
            row["verdict"] = f"error: {err}"
        elif resp.status_code == 404:
            row["verdict"] = "OK — 404, не проиндексируется"
        elif len(resp.history) > 0:
            final_url = resp.url
            row["redirected_to_canonical"] = final_url
            row["verdict"] = ("OK — редиректит на canonical" if final_url.rstrip("/") == canonical_url.rstrip("/")
                               else f"⚠ редиректит НЕ на canonical, а на {final_url}")
        elif resp.status_code == 200:
            tag_match = CANONICAL_RE.search(resp.text)
            tag = tag_match.group(1) if tag_match else None
            row["canonical_tag_found"] = tag or "(нет тега canonical!)"
            same_content = _content_hash(resp.text) == base_hash
            if not same_content:
                row["verdict"] = "OK — контент отличается, это не дубль"
            elif tag and tag.rstrip("/") == canonical_url.rstrip("/"):
                row["verdict"] = "⚠ РИСК: отдаётся напрямую (200, без редиректа), но canonical-тег указывает верно — Google теоретически может дублировать"
            else:
                row["verdict"] = "🔴 КРИТИЧНО: 200, тот же контент, canonical-тег отсутствует/неверный — настоящий дубль"
        else:
            row["verdict"] = f"статус {resp.status_code}"
        rows.append(row)

    return rows


def main():
    parser = argparse.ArgumentParser(description="Проверка дубликатов URL на живом сайте по sitemap.xml")
    parser.add_argument("--sitemap-url", default=DEFAULT_SITEMAP_URL)
    parser.add_argument("--limit", type=int, default=None, help="проверить только первые N URL из sitemap (для быстрого теста)")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--output", default="duplicate_url_report.csv")
    parser.add_argument("--delay", type=float, default=0.15, help="пауза между запросами (сек), чтобы не долбить сервер")
    args = parser.parse_args()

    print(f"--- Забираю sitemap: {args.sitemap_url} ---")
    try:
        urls = fetch_sitemap_urls(args.sitemap_url)
    except Exception as e:
        print(f"✗ Не удалось получить sitemap.xml: {e}")
        sys.exit(1)

    if args.limit:
        urls = urls[: args.limit]
    print(f"✓ Найдено {len(urls)} canonical URL для проверки.")

    session = requests.Session()
    all_rows = []
    risky = 0
    critical = 0

    def worker(u):
        time.sleep(args.delay)
        return check_one_url(u, session)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(worker, u): u for u in urls}
        done = 0
        for fut in as_completed(futures):
            done += 1
            rows = fut.result()
            all_rows.extend(rows)
            for r in rows:
                if r["verdict"].startswith("⚠"):
                    risky += 1
                elif r["verdict"].startswith("🔴"):
                    critical += 1
            print(f"  [{done}/{len(urls)}] проверено: {futures[fut]}")

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "canonical_url", "variant_type", "variant_url", "status",
            "redirected_to_canonical", "canonical_tag_found", "verdict",
        ])
        writer.writeheader()
        writer.writerows(all_rows)

    print("\n" + "=" * 70)
    print(f"Готово. Проверено URL: {len(urls)}, вариантов всего: {len(all_rows)}")
    print(f"⚠ Риск (200 без редиректа, но canonical верный): {risky}")
    print(f"🔴 Критично (200, дубль, canonical отсутствует/неверный): {critical}")
    print(f"Отчёт сохранён в: {args.output}")
    print("=" * 70)

    if risky or critical:
        print("""
РЕКОМЕНДАЦИИ:
1. GitHub Pages — статический хостинг, он физически не может редиректить
   по query-параметрам (?utm=..., ?fbclid=... и т.п.) — файл отдаётся один
   и тот же независимо от "?". Единственный рабочий способ закрыть эти
   URL от повторной индексации — запретить их сканирование в robots.txt:

       Disallow: /*?

2. Если среди дублей есть "index_html" (например /seo/index.html) —
   добавьте отдельно:

       Disallow: /*/index.html$

3. Уже проиндексированные дублирующие URL Google не забудет мгновенно
   даже после правки robots.txt — ускорить можно через Google Search
   Console → Удаления → Временное скрытие URL (по каждому конкретному
   URL из отчёта duplicate_url_report.csv).

4. Проверьте, что self-canonical тег (<link rel="canonical">) есть и
   верен на КАЖДОЙ странице — это уже так в template.html, но отчёт
   покажет, если где-то не так.
""")


if __name__ == "__main__":
    main()
