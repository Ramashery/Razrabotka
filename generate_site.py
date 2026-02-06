import os
import json
import re
import shutil
import html
import random
from datetime import date, datetime
from lxml import etree as ET
import firebase_admin
from firebase_admin import credentials, firestore
from jinja2 import Environment, FileSystemLoader
from transliterate import translit # Импортируем библиотеку для транслитерации

# --- НАСТРОЙКА ---
try:
    if not firebase_admin._apps:
        service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✓ Подключение к Firebase успешно.")
except Exception as e:
    print(f"✗ ОШИКА ПОДКЛЮЧЕНИЯ к Firebase: {e}")
    exit(1)

env = Environment(loader=FileSystemLoader('.'))
home_template = env.get_template('home_template.html')
detail_template = env.get_template('template.html')
error_404_template = env.get_template('404_template.html')
carousel_template = env.get_template('carousel_template.html') # NEW: Шаблон для карусели

OUTPUT_DIR = 'public'
BASE_URL = "https://digital-craft-tbilisi.site"
SUPPORTED_LANGS = ['en', 'ka', 'ru', 'uk']
SITEMAP_DEFAULTS = {
    'home': {'priority': '1.0', 'changefreq': 'weekly'},
    'services': {'priority': '0.9', 'changefreq': 'monthly'},
    'portfolio': {'priority': '0.8', 'changefreq': 'yearly'},
    'blog': {'priority': '0.7', 'changefreq': 'monthly'},
    'contact': {'priority': '0.5', 'changefreq': 'yearly'},
    'carouselItems': {'priority': '0.3', 'changefreq': 'monthly'}, # NEW: Default for carousel items
}

if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)
    print(f"✓ Удалена старая папка '{OUTPUT_DIR}'.")
os.makedirs(OUTPUT_DIR, exist_ok=True)
print(f"✓ Создана папка '{OUTPUT_DIR}'.")

# Карта транслитерации для грузинского (Mkhedruli) в латиницу (упрощенная для slugs)
GEORGIAN_TRANSLIT_MAP = {
    'ა': 'a', 'ბ': 'b', 'გ': 'g', 'დ': 'd', 'ე': 'e', 'ვ': 'v', 'ზ': 'z', 'თ': 't', 'ი': 'i',
    'კ': 'k', 'ლ': 'l', 'მ': 'm', 'ნ': 'n', 'ო': 'o', 'პ': 'p', 'ჟ': 'zh', 'რ': 'r', 'ს': 's',
    'ტ': 't', 'უ': 'u', 'ფ': 'p', 'ქ': 'k', 'ღ': 'gh', 'ყ': 'q', 'შ': 'sh', 'ჩ': 'ch', 'ც': 'ts',
    'ძ': 'dz', 'წ': 'ts', 'ჭ': 'ch', 'ხ': 'kh', 'ჯ': 'j', 'ჰ': 'h',
    # Добавьте заглавные буквы, если это необходимо до перевода в нижний регистр,
    # но обычно все равно преобразуется в нижний регистр
}

# --- НОВАЯ ФУНКЦИЯ ДЛЯ ГЕНЕРАЦИИ ЯКОРНЫХ ССЫЛОК (Универсальная) ---
def slugify(text):
    text = str(text).lower() # Убеждаемся, что это строка и приводим к нижнему регистру

    # 1. Обработка грузинских символов
    # Проверяем, содержит ли текст грузинские символы (диапазон Mkhedruli)
    has_georgian = any('\u10D0' <= c <= '\u10FF' for c in text)
    if has_georgian:
        transliterated_georgian = "".join(GEORGIAN_TRANSLIT_MAP.get(c, c) for c in text)
        text = transliterated_georgian # Применяем транслитерацию для дальнейшей обработки

    # 2. Обработка кириллических символов
    # Проверяем, содержит ли текст кириллические символы (диапазон Cyrillic)
    has_cyrillic = any('\u0400' <= c <= '\u04FF' for c in text)
    if has_cyrillic:
        try:
            # 'ru' локаль хорошо подходит для русского и большинства украинских символов
            text = translit(text, 'ru', reversed=True)
        except Exception as e:
            # Fallback, если translit не справляется (например, из-за смешанного текста или неподдерживаемых символов)
            print(f"  [ПРЕДУПРЕЖДЕНИЕ] Ошибка транслитерации кириллицы для '{text}': {e}. Продолжение без транслитерации.")
            pass # Продолжаем без транслитерации этой части, она будет очищена на следующем шаге.

    # 3. Общая очистка: удаление всех, кроме латиницы, цифр, пробелов и дефисов
    text = re.sub(r'[^a-z0-9\s-]', '', text)

    # 4. Нормализация дефисов и обрезка
    text = re.sub(r'[\s-]+', '-', text).strip('-')

    return text

# --- Функции для получения данных и рендеринга страниц ---
def get_all_data():
    site_data = {}
    try:
        home_doc = db.collection('home').document('content').get()
        if home_doc.exists:
            site_data['home'] = home_doc.to_dict()
            print("✓ Загружены данные для домашней страницы.")
        else:
            site_data['home'] = {}
            print("! Данные для домашней страницы не найдены.")

        # NEW: Добавлена коллекция 'carouselItems'
        collections = ['services', 'portfolio', 'blog', 'contact', 'carouselItems']
        for col in collections:
            # Для carouselItems добавим сортировку по полю 'order'
            if col == 'carouselItems':
                docs = db.collection(col).order_by('order').stream()
            else:
                docs = db.collection(col).stream()
            
            site_data[col] = []
            for doc in docs:
                doc_data = doc.to_dict()
                doc_data['id'] = doc.id
                doc_data['collection_name'] = col
                
                if doc_data.get('status') == 'archived':
                    print(f"  [SKIP] Пропущена архивная страница: {col}/{doc.id}")
                    continue
                
                if 'schemaJsonLd' in doc_data and isinstance(doc_data['schemaJsonLd'], str):
                    try:
                        doc_data['schemaJsonLd'] = json.loads(doc_data['schemaJsonLd'])
                    except json.JSONDecodeError:
                        print(f"  [ПРЕДУПРЕЖДЕНИЕ] Не удалось разобрать schemaJsonLd для {col}/{doc.id}. Оставлено как строка.")
                        doc_data['schemaJsonLd'] = {}
                
                site_data[col].append(doc_data)
            print(f"✓ Загружено {len(site_data[col])} активных документов из коллекции '{col}'.")
        
        print("✓ Все данные из Firestore успешно загружены.")
        return site_data
    except Exception as e:
        print(f"✗ Критическая ОШИБКА при загрузке данных из Firestore: {e}")
        return None

def create_lean_preview(items):
    previews = []
    for item in items:
        media_list = item.get('media', [])
        first_image = media_list[0] if isinstance(media_list, list) and len(media_list) > 0 else ''
        description = item.get('description', '')
        if description and len(description) > 500:
            description = description[:497] + '...'

        preview_item = {
            'title': item.get('title', ''),
            'subtitle': item.get('subtitle', ''),
            'description': description,
            'urlSlug': item.get('urlSlug', ''),
            'lang': item.get('lang', 'en'),
            'collection_name': item.get('collection_name', ''),
            'media': [first_image],
        }
        previews.append(preview_item)
    return previews

def format_content(content_string):
    if not content_string:
        return ""

    def escape_pre_content(match):
        pre_attributes = match.group(1)
        inner_content = match.group(2)
        code_match = re.match(r'\s*<code>(.*)</code>\s*', inner_content, re.DOTALL | re.IGNORECASE)
        if code_match:
            code_content = code_match.group(1)
            escaped_content = html.escape(code_content)
            return f'<pre{pre_attributes}><code>{escaped_content}</code></pre>'
        else:
            escaped_content = html.escape(inner_content)
            return f'<pre{pre_attributes}>{escaped_content}</pre>'

    processed_content = re.sub(
        r'<pre(.*?)>(.*?)</pre>',
        escape_pre_content,
        content_string,
        flags=re.DOTALL | re.IGNORECASE
    )

    processed_content = processed_content.replace('\r\n', '\n')
    blocks = re.split(r'\n{2,}', processed_content)
    html_parts = []
    for block in blocks:
        trimmed_block = block.strip()
        if not trimmed_block:
            continue
        
        youtube_regex = r"https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch?v=|watch\?.*&v=|shorts\/))([a-zA-Z0-9_-]{11})"
        image_regex = r"^https?:\/\/[^<>\s]+\.(?:jpg|jpeg|png|gif|webp|svg)\s*$"
        html_tag_regex = r"^\s*<(p|div|h[1-6]|ul|ol|li|blockquote|hr|table|pre)"
        
        youtube_match = re.search(youtube_regex, trimmed_block)
        image_match = re.match(image_regex, trimmed_block)
        html_match = re.match(html_tag_regex, trimmed_block, re.IGNORECASE)
        
        if html_match:
            html_parts.append(trimmed_block)
        elif youtube_match:
            video_id = youtube_match.group(1)
            embed_html = f'<div class="embedded-video" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; background: #000; margin: 1.5em 0; border-radius: 4px; border: 1px solid var(--color-border);"><iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" src="https://www.youtube.com/embed/{video_id}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>'
            html_parts.append(embed_html)
        elif image_match:
            img_html = f'<p style="margin: 1.5em 0;"><img src="{trimmed_block}" alt="Embedded content" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px; border: 1px solid var(--color-border);" /></p>'
            html_parts.append(img_html)
        else:
            html_parts.append('<p>' + trimmed_block.replace('\n', '<br>') + '</p>')
            
    grouped_html = []
    GROUP_SIZE = 3
    for i in range(0, len(html_parts), GROUP_SIZE):
        group = html_parts[i:i + GROUP_SIZE]
        if group:
            grouped_html.append(f'<div class="content-group">{ "".join(group) }</div>')
            
    return '\n'.join(grouped_html)

def generate_home_page(all_data):
    try:
        home_data = all_data.get('home')
        sections_data = {
            'services': create_lean_preview(all_data.get('services', [])),
            'portfolio': create_lean_preview(all_data.get('portfolio', [])),
            'blog': create_lean_preview(all_data.get('blog', [])),
            'contact': create_lean_preview(all_data.get('contact', []))
        }
        html_content = home_template.render(home=home_data, sections_data=sections_data)
        with open(os.path.join(OUTPUT_DIR, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        for lang in SUPPORTED_LANGS:
            if lang != 'en':
                lang_dir = os.path.join(OUTPUT_DIR, lang)
                os.makedirs(lang_dir, exist_ok=True)
        print("✓ Главная страница (основная) и языковые папки успешно сгенерированы.")
    except Exception as e:
        print(f"✗ ОШИБКА при генерации главной страницы: {e}")

def generate_detail_page(item, all_data, alternates):
    collection_name = item['collection_name']
    lang = item.get('lang', 'en')
    slug = item['urlSlug']
    path = os.path.join(OUTPUT_DIR, lang, collection_name, slug, 'index.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    
    try:
        # --- ЛОГИКА ДЛЯ АВТОМАТИЧЕСКОГО ОГЛАВЛЕНИЯ (TOC) ---
        raw_content = item.get('mainContent', '')
        toc_html = None
        final_content_html = ''
        
        # Словарь переводов для кнопки
        toc_titles = {
            'en': 'Table of Contents',
            'ru': 'Содержание',
            'ka': 'სარჩევი',
            'uk': 'Зміст'
        }
        toc_title = toc_titles.get(lang, 'Table of Contents')
        
        if raw_content and raw_content.strip().startswith('[TOC]'):
            content_without_toc_marker = raw_content.replace('[TOC]', '', 1).strip()
            content_html = format_content(content_without_toc_marker)
            
            parser = ET.HTMLParser(remove_blank_text=True)
            tree = ET.fromstring(f'<div>{content_html}</div>', parser)
            
            toc_items = []
            for header in tree.xpath('.//h2|.//h3'):
                header_text = "".join(header.itertext()).strip()
                if header_text:
                    header_slug = slugify(header_text)
                    header.set('id', header_slug)
                    toc_items.append({
                        'level': header.tag,
                        'text': header_text,
                        'slug': header_slug
                    })
            
            if toc_items:
                toc_list_html = '<ul>'
                for toc_item in toc_items:
                    class_name = 'toc-level-h3' if toc_item['level'] == 'h3' else ''
                    toc_list_html += f'<li class="{class_name}"><a href="#{toc_item["slug"]}">{toc_item["text"]}</a></li>'
                toc_list_html += '</ul>'
                toc_html = toc_list_html

            # === ИСПРАВЛЕНИЕ ПРОБЛЕМЫ №3 ===
            # Извлекаем контент из тега <body>, который lxml создает автоматически,
            # чтобы избежать вложенности <body> в итоговом HTML.
            body_content = tree.find('body')
            if body_content is not None:
                final_content_html = "".join([ET.tostring(child, encoding='unicode', method='html') for child in body_content])
            else:
                # Резервный вариант на случай, если <body> не найден
                final_content_html = "".join([ET.tostring(child, encoding='unicode', method='html') for child in tree])
        else:
            final_content_html = format_content(raw_content)
        # --- КОНЕЦ ЛОГИКИ TOC ---

        # NEW: Логика для рендеринга карусели
        carousel_html = ""
        carousel_items_for_lang = [
            c_item for c_item in all_data.get('carouselItems', []) 
            if c_item.get('lang', 'en') == lang
        ]
        if carousel_items_for_lang:
            carousel_html = carousel_template.render(carousel_items=carousel_items_for_lang)
        # --- КОНЕЦ NEW: Логика для рендеринга карусели ---

        pool = all_data.get('services', []) + all_data.get('blog', []) + all_data.get('portfolio', [])
        candidates = [cand for cand in pool if cand.get('lang') == lang and cand.get('urlSlug') != slug and 'urlSlug' in cand]
        if len(candidates) > 6:
            related_items = random.sample(candidates, 6)
        else:
            related_items = candidates
        
        html_content = detail_template.render(
            item=item, 
            related_items=related_items, 
            alternates=alternates,
            toc_html=toc_html,
            toc_title=toc_title,
            final_content_html=final_content_html,
            carousel_html=carousel_html # NEW: Передаем HTML карусели в шаблон
        )
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"  ✓ Создана страница: {os.path.join(lang, collection_name, slug)}")
    except Exception as e:
        print(f"✗ ОШИБКА при рендере страницы {collection_name}/{slug}: {e}")

def copy_static_assets():
    print("\nНачинаю копирование статических файлов (CSS, JS, и т.д.)...")
    ignore_list = {
        '.git', '.github', OUTPUT_DIR, 'generate_site.py', 'test_sitemap_data.py',
        'template.html', 'home_template.html', '404_template.html', 'carousel_template.html', # NEW: Добавлен carousel_template.html
        'firebase.json', 'README.md', '__pycache__', 'index.html', 'page.html', 'admin.txt', 'main.txt', 'sitemap.xml',
        'package.json', 'package-lock.json', 'node_modules', 'requirements.txt'
    }
    for item_name in os.listdir('.'):
        if item_name not in ignore_list:
            source_path = os.path.join('.', item_name)
            dest_path = os.path.join(OUTPUT_DIR, item_name)
            try:
                if os.path.isfile(source_path):
                    shutil.copy2(source_path, dest_path)
                elif os.path.isdir(source_path):
                    shutil.copytree(source_path, dest_path, dirs_exist_ok=True)
            except Exception as e:
                print(f"✗ Не удалось скопировать '{item_name}': {e}")
    print("✓ Копирование статических файлов завершено.")

def build_url_for_sitemap(page):
    lang = page.get('lang', 'en')
    collection_name = page.get('collection_name', '')
    slug = page.get('urlSlug', '')
    if collection_name == 'home':
        return f"{BASE_URL}/"
    # NEW: Carousel items do not have their own detail pages, they are embedded.
    # So, we don't generate sitemap entries for them directly.
    # If a carousel item links to a detail page, that detail page will have its own sitemap entry.
    if collection_name == 'carouselItems':
        return None # Do not include carousel items as separate URLs in sitemap
    return f"{BASE_URL}/{lang}/{collection_name}/{slug}/"

def generate_sitemap_xml(pages_for_sitemap, all_data):
    print("\n" + "="*60)
    print("НАЧАЛО ГЕНЕРАЦИИ SITEMAP XML")
    print("="*60)
    SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
    XHTML_NS = "http://www.w3.org/1999/xhtml"
    NSMAP = {None: SITEMAP_NS, "xhtml": XHTML_NS}
    urlset = ET.Element("urlset", nsmap=NSMAP)
    print("1. Добавляю главную страницу...")
    home_data = all_data.get('home', {})
    home_lastmod_iso = home_data.get('lastModified')
    home_lastmod = date.today().isoformat()
    if home_lastmod_iso:
        try:
            home_lastmod = datetime.fromisoformat(home_lastmod_iso.replace("Z", "+00:00")).strftime('%Y-%m-%d')
        except ValueError:
            pass
    url_el = ET.SubElement(urlset, "url")
    ET.SubElement(url_el, "loc").text = f"{BASE_URL}/"
    ET.SubElement(url_el, "lastmod").text = home_lastmod
    ET.SubElement(url_el, "changefreq").text = SITEMAP_DEFAULTS['home']['changefreq']
    ET.SubElement(url_el, "priority").text = SITEMAP_DEFAULTS['home']['priority']
    
    # Filter out carouselItems from pages_for_sitemap as they are not standalone pages
    pages_for_sitemap = [p for p in pages_for_sitemap if p.get('collection_name') != 'home' and p.get('collection_name') != 'carouselItems']
    
    print(f"\n2. Обрабатываю {len(pages_for_sitemap)} внутренних страниц...")
    
    grouped = {}
    loners = []
    for page in pages_for_sitemap:
        key = page.get('translationGroupKey')
        if key is not None and str(key).strip() != '':
            group_key_str = str(key).strip()
            grouped.setdefault(group_key_str, []).append(page)
        else:
            loners.append(page)
    for group_key, pages_in_group in grouped.items():
        if not pages_in_group: continue
        hreflang_map = {}
        for page_in_group in pages_in_group:
            lang = page_in_group.get('lang')
            if lang and lang in SUPPORTED_LANGS:
                region = page_in_group.get('region', '').strip().upper()
                url = build_url_for_sitemap(page_in_group)
                if url: # Ensure URL is not None (e.g., for carousel items)
                    hreflang_map[lang] = (url, region)
        for page in pages_in_group:
            loc = build_url_for_sitemap(page)
            if not loc: continue # Skip if URL is None
            url_el = ET.SubElement(urlset, "url")
            ET.SubElement(url_el, "loc").text = loc
            last_mod_str = page.get('lastModified')
            lastmod = date.today().isoformat()
            if last_mod_str:
                try:
                    lastmod = datetime.fromisoformat(last_mod_str.replace("Z", "+00:00")).strftime('%Y-%m-%d')
                except ValueError:
                    pass
            ET.SubElement(url_el, "lastmod").text = lastmod
            changefreq = page.get('sitemapChangefreq') or SITEMAP_DEFAULTS.get(page.get('collection_name'), {}).get('changefreq', 'monthly')
            priority = page.get('sitemapPriority') or SITEMAP_DEFAULTS.get(page.get('collection_name'), {}).get('priority', '0.6')
            ET.SubElement(url_el, "changefreq").text = str(changefreq)
            ET.SubElement(url_el, "priority").text = str(priority)
            if len(hreflang_map) > 1:
                if 'en' in hreflang_map:
                    en_url, _ = hreflang_map['en']
                    ET.SubElement(url_el, f"{{{XHTML_NS}}}link", rel="alternate", hreflang="x-default", href=en_url)
                for lang_code, (href_url, region_code) in hreflang_map.items():
                    hreflang_attr_value = f"{lang_code}-{region_code}" if region_code else lang_code
                    ET.SubElement(url_el, f"{{{XHTML_NS}}}link", rel="alternate", hreflang=hreflang_attr_value, href=href_url)
    for page in loners:
        loc = build_url_for_sitemap(page)
        if not loc: continue # Skip if URL is None
        url_el = ET.SubElement(urlset, "url")
        ET.SubElement(url_el, "loc").text = loc
        last_mod_str = page.get('lastModified')
        lastmod = date.today().isoformat()
        if last_mod_str:
            try:
                lastmod = datetime.fromisoformat(last_mod_str.replace("Z", "+00:00")).strftime('%Y-%m-%d')
            except ValueError:
                pass
        ET.SubElement(url_el, "lastmod").text = lastmod
        changefreq = page.get('sitemapChangefreq') or SITEMAP_DEFAULTS.get(page.get('collection_name'), {}).get('changefreq', 'monthly')
        priority = page.get('sitemapPriority') or SITEMAP_DEFAULTS.get(page.get('collection_name'), {}).get('priority', '0.6')
        ET.SubElement(url_el, "changefreq").text = str(changefreq)
        ET.SubElement(url_el, "priority").text = str(priority)
    xml_string = ET.tostring(urlset, pretty_print=True, xml_declaration=True, encoding='UTF-8')
    output_path = os.path.join(OUTPUT_DIR, 'sitemap.xml')
    with open(output_path, 'wb') as f:
        f.write(xml_string)
    print("\n" + "="*60)
    print("РЕЗУЛЬТАТ ГЕНЕРАЦИИ SITEMAP")
    print("="*60)
    print(f"✓ Файл sitemap.xml создан. Всего URL: {len(urlset)}")

# --- Основная функция ---
def main():
    print("!!! ВЫПОЛНЯЕТСЯ ОБНОВЛЕННАЯ ВЕРСИЯ generate_site.py !!!")
    all_data = get_all_data()
    if not all_data:
        print("✗ Отмена генерации сайта из-за ошибки загрузки данных.")
        return
    
    generate_home_page(all_data)
    
    valid_pages_for_sitemap = []
    # NEW: Добавлена коллекция 'carouselItems' для обработки, но не для генерации отдельных страниц
    collections_to_generate = ['services', 'portfolio', 'blog', 'contact', 'carouselItems']
    
    print("\nГруппировка страниц по ключу перевода для hreflang...")
    translations_map = {}
    all_items_flat = []
    for collection in collections_to_generate:
        all_items_flat.extend(all_data.get(collection, []))

    for item in all_items_flat:
        key = item.get('translationGroupKey')
        if key and key.strip():
            clean_key = key.strip()
            if clean_key not in translations_map:
                translations_map[clean_key] = []
            translations_map[clean_key].append(item)
    print(f"✓ Найдено {len(translations_map)} групп перевода для hreflang.")
    
    print("\nНачинаю генерацию детальных страниц:")
    for collection in collections_to_generate:
        # NEW: Carousel items are not standalone pages, they are embedded.
        # So, we skip generating individual HTML files for them.
        if collection == 'carouselItems':
            print(f"  [SKIP] Пропущена генерация отдельных HTML-файлов для коллекции '{collection}'.")
            # We still add them to valid_pages_for_sitemap if they have a URL slug,
            # but build_url_for_sitemap will return None for them.
            for item in all_data.get(collection, []):
                if item.get('urlSlug') and item.get('lang'):
                    valid_pages_for_sitemap.append(item)
            continue

        if collection in all_data:
            for item in all_data[collection]:
                if item.get('urlSlug') and item.get('lang'):
                    translation_key = item.get('translationGroupKey', '').strip()
                    alternates = translations_map.get(translation_key, [])
                    generate_detail_page(item, all_data, alternates)
                    valid_pages_for_sitemap.append(item)
                else:
                    print(f"  [ПРЕДУПРЕЖДЕНИЕ] Пропущен элемент в '{collection}' (ID: {item.get('id', 'N/A')})")
        else:
            print(f"  [ПРЕДУПРЕЖДЕНИЕ] Коллекция '{collection}' не найдена в данных Firebase.")
    
    copy_static_assets()
    
    print(f"\n" + "="*60)
    print(f"Подготовка данных для sitemap.xml...")
    if valid_pages_for_sitemap:
        generate_sitemap_xml(valid_pages_for_sitemap, all_data)
    else:
        print("! Не найдено валидных страниц для создания sitemap.xml.")
    
    print("\nСоздание 404.html из шаблона...")
    try:
        html_content_404 = error_404_template.render()
        not_found_path = os.path.join(OUTPUT_DIR, '404.html')
        with open(not_found_path, 'w', encoding='utf-8') as f:
            f.write(html_content_404)
        print("✓ Файл 404.html успешно создан.")
    except Exception as e:
        print(f"✗ ВНИМАНИЕ: Не удалось создать 404.html: {e}")

    print("\n" + "="*60)
    print("Генерация сайта полностью завершена!")
    print("="*60)

if __name__ == '__main__':
    main()
