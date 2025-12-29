import os
import json
import re
import shutil
from datetime import date, datetime
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom
import firebase_admin
from firebase_admin import credentials, firestore
from jinja2 import Environment, FileSystemLoader

# --- НАСТРОЙКА ---

# Firebase
try:
    if not firebase_admin._apps:
        # Убедитесь, что переменная окружения FIREBASE_SERVICE_ACCOUNT установлена
        service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Подключение к Firebase успешно.")
except Exception as e:
    print(f"ОШИБКА ПОДКЛЮЧЕНИЯ к Firebase: {e}")
    exit(1)

# Jinja2 (Шаблонизатор)
env = Environment(loader=FileSystemLoader('.'))
home_template = env.get_template('home_template.html')
detail_template = env.get_template('template.html')

# Папки и основные URL
OUTPUT_DIR = 'public'
BASE_URL = "https://digital-craft-tbilisi.site"
SUPPORTED_LANGS = ['en', 'ka', 'ru', 'ua']

# Настройки для Sitemap (теперь используются как значения по умолчанию)
SITEMAP_DEFAULTS = {
    'home': {'priority': '1.0', 'changefreq': 'weekly'},
    'services': {'priority': '0.9', 'changefreq': 'monthly'},
    'portfolio': {'priority': '0.8', 'changefreq': 'yearly'},
    'blog': {'priority': '0.7', 'changefreq': 'monthly'},
    'contact': {'priority': '0.5', 'changefreq': 'yearly'},
}

# Очистка папки 'public' перед сборкой
if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)
os.makedirs(OUTPUT_DIR, exist_ok=True)


# --- ФУНКЦИИ ---

def get_all_data():
    site_data = {}
    try:
        home_doc = db.collection('home').document('content').get()
        if home_doc.exists:
            site_data['home'] = home_doc.to_dict()

        collections = ['services', 'portfolio', 'blog', 'contact']
        for col in collections:
            docs = db.collection(col).stream()
            site_data[col] = []
            for doc in docs:
                doc_data = doc.to_dict()
                doc_data['id'] = doc.id
                doc_data['collection_name'] = col

                if 'schemaJsonLd' in doc_data and isinstance(doc_data['schemaJsonLd'], str):
                    try:
                        doc_data['schemaJsonLd'] = json.loads(doc_data['schemaJsonLd'])
                    except json.JSONDecodeError:
                        doc_data['schemaJsonLd'] = None
                site_data[col].append(doc_data)

        print("Все данные из Firestore успешно загружены.")
        return site_data
    except Exception as e:
        print(f"Критическая ОШИБКА при загрузке данных: {e}")
        return None

def format_content(content_string):
    if not content_string:
        return ""
    processed_content = content_string.replace('\r\n', '\n')
    blocks = re.split(r'\n{2,}', processed_content)
    html_parts = []
    for block in blocks:
        trimmed_block = block.strip()
        if not trimmed_block:
            continue
        youtube_regex = r"https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch?v=|watch\?.*&v=|shorts\/))([a-zA-Z0-9_-]{11})"
        image_regex = r"^https?:\/\/[^<>\s]+\.(?:jpg|jpeg|png|gif|webp|svg)\s*$"
        html_tag_regex = r"^\s*<(p|div|h[1-6]|ul|ol|li|blockquote|hr|table|pre)"
        youtube_match = re.match(youtube_regex, trimmed_block)
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
            paragraph = '<p>' + trimmed_block.replace('\n', '<br>') + '</p>'
            html_parts.append(paragraph)
    return '\n'.join(html_parts)

def generate_home_page(all_data):
    try:
        home_data = all_data.get('home')
        if not home_data:
            print("[ERROR] Данные для главной страницы не найдены!")
            return

        sections_data = {
            'services': all_data.get('services', []),
            'portfolio': all_data.get('portfolio', []),
            'blog': all_data.get('blog', []),
            'contact': all_data.get('contact', [])
        }

        html_content = home_template.render(
            home=home_data,
            sections_data=sections_data
        )
        
        # Генерация главной страницы в корне
        path = os.path.join(OUTPUT_DIR, 'index.html')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        # Создание папок для языковых версий главной, чтобы firebase hosting мог их найти
        for lang in SUPPORTED_LANGS:
            if lang != 'en': # 'en' будет обслуживаться из корня через `index.html`
                 os.makedirs(os.path.join(OUTPUT_DIR, lang), exist_ok=True)

        print("✓ Главная страница и структура папок для языков успешно сгенерированы.")

    except Exception as e:
        print(f"[ERROR] Ошибка при генерации главной страницы: {e}")


def generate_detail_page(item, all_data):
    collection_name = item['collection_name']
    lang = item.get('lang', 'en')
    slug = item['urlSlug']

    # --- ИЗМЕНЕНИЕ №1: Возвращаем префикс для ВСЕХ языков, включая 'en' ---
    # Это создаст папки типа /public/en/services/...
    path = os.path.join(OUTPUT_DIR, lang, collection_name, slug, 'index.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)

    try:
        related_items = []
        pool = all_data.get('services', []) + all_data.get('blog', [])
        for related_item in pool:
            if len(related_items) >= 3: break
            if related_item.get('lang') == lang and related_item.get('urlSlug') != slug and 'urlSlug' in related_item:
                related_items.append(related_item)

        html_content = detail_template.render(
            item=item,
            related_items=related_items,
            format_content=format_content
        )

        with open(path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"✓ Создана страница: {os.path.join(lang, collection_name, slug)}")
    except Exception as e:
        print(f"[ERROR] Ошибка при рендере страницы {collection_name}/{slug}: {e}")

def copy_static_assets():
    print("\nНачинаю копирование ассетов...")
    ignore_list = {'.git', '.github', OUTPUT_DIR, 'generate_site.py', 'template.html', 'home_template.html', 'firebase.json', 'README.md', '__pycache__', 'index.html', 'page.html', 'admin.txt', 'main.txt'}
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
                print(f"Не удалось скопировать {item_name}: {e}")
    print("Копирование ассетов завершено.")

def build_url_for_sitemap(page):
    # --- ИЗМЕНЕНИЕ №2: Возвращаем префикс для ВСЕХ языков, включая 'en' ---
    # Это создаст URL типа .../en/services/slug/
    lang_prefix = f"/{page['lang']}"
    slug = page.get('urlSlug', '')
    if not slug.endswith('/'):
        slug += '/'
    return f"{BASE_URL}{lang_prefix}/{page['collection_name']}/{slug}"


def generate_sitemap_xml(pages_for_sitemap, all_data):
    urlset = Element('urlset', xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    urlset.set('xmlns:xhtml', "http://www.w3.org/1999/xhtml")
    
    # Пытаемся взять дату последнего изменения главной страницы, если нет - сегодня
    home_data = all_data.get('home', {})
    home_lastmod_iso = home_data.get('lastModified')
    if home_lastmod_iso:
        home_lastmod = datetime.fromisoformat(home_lastmod_iso.replace("Z", "+00:00")).strftime('%Y-%m-%d')
    else:
        home_lastmod = date.today().isoformat()


    # --- 1. ГЕНЕРАЦИЯ БЛОКОВ ДЛЯ ГЛАВНОЙ СТРАНИЦЫ ---
    # Создаем общий список ссылок для всех версий главной
    home_alternates = []
    # Главная по умолчанию (x-default) и английская (en) ведут на корень сайта
    home_alternates.append({'rel': 'alternate', 'hreflang': 'x-default', 'href': f"{BASE_URL}/"})
    home_alternates.append({'rel': 'alternate', 'hreflang': 'en', 'href': f"{BASE_URL}/"})
    
    for lang in SUPPORTED_LANGS:
        if lang != 'en': # Остальные языки ведут на /lang/
            lang_href = f"{BASE_URL}/{lang}/"
            home_alternates.append({'rel': 'alternate', 'hreflang': lang, 'href': lang_href})

    # Создаем <url> для каждой языковой версии главной (en, ka, ru, ua)
    home_urls_to_generate = [f"{BASE_URL}/"] + [f"{BASE_URL}/{lang}/" for lang in SUPPORTED_LANGS if lang != 'en']
    
    for url_loc in home_urls_to_generate:
        url_el = SubElement(urlset, 'url')
        SubElement(url_el, 'loc').text = url_loc
        SubElement(url_el, 'lastmod').text = home_lastmod
        SubElement(url_el, 'changefreq').text = SITEMAP_DEFAULTS['home']['changefreq']
        SubElement(url_el, 'priority').text = SITEMAP_DEFAULTS['home']['priority']
        for alt in home_alternates:
            SubElement(url_el, 'xhtml:link', **alt)

    # --- 2. ГЕНЕРАЦИЯ БЛОКОВ ДЛЯ ВНУТРЕННИХ СТРАНИЦ ---
    # Группируем страницы по ключу перевода
    grouped = {}
    for page in pages_for_sitemap:
        key = page.get('translationGroupKey')
        if key: # Группируем только если есть ключ
            if key not in grouped: grouped[key] = []
            grouped[key].append(page)
        else: # Страницы без группы (например, контакты) обрабатываем индивидуально
            if page['id'] not in grouped: grouped[page['id']] = []
            grouped[page['id']].append(page)


    for group_key, pages_in_group in grouped.items():
        # Создаем карту ссылок для текущей группы
        hreflang_map = {p['lang']: build_url_for_sitemap(p) for p in pages_in_group if p.get('lang')}
        
        for page in pages_in_group:
            url_el = SubElement(urlset, 'url')
            SubElement(url_el, 'loc').text = build_url_for_sitemap(page)
            
            # Используем дату из админки, если есть, иначе сегодня
            last_mod_str = page.get('lastModified', date.today().isoformat())
            if isinstance(last_mod_str, str):
                last_mod_date = datetime.fromisoformat(last_mod_str.replace("Z", "+00:00"))
                SubElement(url_el, 'lastmod').text = last_mod_date.strftime('%Y-%m-%d')
            else: 
                SubElement(url_el, 'lastmod').text = date.today().isoformat()

            default_config = SITEMAP_DEFAULTS.get(page['collection_name'], {'changefreq': 'monthly', 'priority': '0.6'})
            SubElement(url_el, 'changefreq').text = page.get('sitemapChangefreq') or default_config['changefreq']
            SubElement(url_el, 'priority').text = page.get('sitemapPriority') or default_config['priority']

            # Добавляем ссылки на другие языковые версии
            if len(hreflang_map) > 1:
                for lang_code, url in hreflang_map.items():
                    SubElement(url_el, 'xhtml:link', rel="alternate", hreflang=lang_code, href=url)

    xml_string = tostring(urlset, 'utf-8')
    pretty_xml = minidom.parseString(xml_string).toprettyxml(indent="    ")
    output_path = os.path.join(OUTPUT_DIR, 'sitemap.xml')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(pretty_xml)
    print(f"✓ Карта сайта успешно сгенерирована: {output_path}")

def main():
    all_data = get_all_data()
    if not all_data:
        print("Не удалось получить данные. Генерация сайта отменена.")
        return

    generate_home_page(all_data)

    valid_pages_for_sitemap = []
    collections_to_generate = ['services', 'portfolio', 'blog', 'contact']

    for collection in collections_to_generate:
        if collection in all_data:
            for item in all_data[collection]:
                if item.get('urlSlug') and item.get('lang'):
                    generate_detail_page(item, all_data)
                    valid_pages_for_sitemap.append(item)
                else:
                    print(f"[WARNING] Пропущен элемент в '{collection}' (ID: {item.get('id', 'N/A')}) из-за отсутствия 'urlSlug' или 'lang'.")

    copy_static_assets()

    print("\nПодготовка данных для sitemap.xml...")
    if valid_pages_for_sitemap:
        generate_sitemap_xml(valid_pages_for_sitemap, all_data)
    else:
        print("! Не найдено валидных страниц для создания sitemap.xml.")

    print("\nГенерация сайта полностью завершена!")


if __name__ == '__main__':
    main()
