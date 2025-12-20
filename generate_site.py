import os
import json
import re # Импортируем модуль для регулярных выражений
import shutil
from datetime import date
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom
import firebase_admin
from firebase_admin import credentials, firestore
from jinja2 import Environment, FileSystemLoader

# --- НАСТРОЙКА ---

# Firebase
try:
    if not firebase_admin._apps:
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
template = env.get_template('template.html')

# Папки и основные URL
OUTPUT_DIR = 'public'
BASE_URL = "https://digital-craft-tbilisi.site"
SUPPORTED_LANGS = ['en', 'ka', 'ru', 'ua']

# Настройки для Sitemap
SITEMAP_CONFIG = {
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

# ==============================================================================
# ИСПРАВЛЕНИЕ 1: ПОЛНОСТЬЮ НОВАЯ ФУНКЦИЯ ФОРМАТИРОВАНИЯ КОНТЕНТА
# Эта версия работает так же, как и в вашем main.js
# ==============================================================================
def format_content(content_string):
    """
    Форматирует текст из Firestore в безопасный HTML.
    Автоматически преобразует URL-ы картинок и YouTube в HTML-теги.
    """
    if not content_string:
        return ""

    # Заменяем Windows-переводы строк на Unix
    processed_content = content_string.replace('\r\n', '\n')
    # Разбиваем текст на блоки по двум и более переводам строки
    blocks = re.split(r'\n{2,}', processed_content)

    html_parts = []
    for block in blocks:
        trimmed_block = block.strip()
        if not trimmed_block:
            continue

        # Регулярные выражения для определения типа контента
        youtube_regex = r"https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch?v=|watch\?.*&v=|shorts\/))([a-zA-Z0-9_-]{11})"
        image_regex = r"^https?:\/\/[^<>\s]+\.(?:jpg|jpeg|png|gif|webp|svg)\s*$"
        html_tag_regex = r"^\s*<(p|div|h[1-6]|ul|ol|li|blockquote|hr|table|pre)"

        youtube_match = re.match(youtube_regex, trimmed_block)
        image_match = re.match(image_regex, trimmed_block)
        html_match = re.match(html_tag_regex, trimmed_block, re.IGNORECASE)

        if html_match:
            # Если блок уже содержит HTML, добавляем его как есть
            html_parts.append(trimmed_block)
        elif youtube_match:
            # Если блок - это ссылка на YouTube, создаем iframe
            video_id = youtube_match.group(1)
            embed_html = f'<div class="embedded-video" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; background: #000; margin: 1.5em 0; border-radius: 4px; border: 1px solid var(--color-border);"><iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" src="https://www.youtube.com/embed/{video_id}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>'
            html_parts.append(embed_html)
        elif image_match:
            # Если блок - это ссылка на картинку, создаем тег img
            img_html = f'<p style="margin: 1.5em 0;"><img src="{trimmed_block}" alt="Embedded content" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px; border: 1px solid var(--color-border);" /></p>'
            html_parts.append(img_html)
        else:
            # В противном случае, это обычный текст. Оборачиваем в <p>
            # и заменяем одиночные переводы строк на <br>
            paragraph = '<p>' + trimmed_block.replace('\n', '<br>') + '</p>'
            html_parts.append(paragraph)

    return '\n'.join(html_parts)

def generate_detail_page(item, all_data):
    collection_name = item['collection_name']
    lang = item.get('lang', 'en')
    slug = item['urlSlug']

    lang_prefix = f"{lang}/" if lang != 'en' else "en/"
    path = os.path.join(OUTPUT_DIR, lang_prefix, collection_name, slug, 'index.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)

    try:
        related_items = []
        pool = all_data.get('services', []) + all_data.get('blog', [])
        for related_item in pool:
            if len(related_items) >= 3: break
            if related_item.get('lang') == lang and related_item.get('urlSlug') != slug and 'urlSlug' in related_item:
                related_items.append(related_item)

        html_content = template.render(
            item=item,
            related_items=related_items,
            site_data=all_data,
            format_content=format_content # Используем новую функцию
        )

        with open(path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"✓ Создана страница: {os.path.join(lang_prefix, collection_name, slug)}")
    except Exception as e:
        print(f"[ERROR] Ошибка при рендере страницы {collection_name}/{slug}: {e}")

def generate_home_and_copy_assets():
    try:
        shutil.copy2('index.html', os.path.join(OUTPUT_DIR, 'index.html'))
        print("✓ Создана главная страница (на основе index.html)")
    except Exception as e:
        print(f"[ERROR] Ошибка при создании главной страницы: {e}")

    print("\nНачинаю копирование ассетов...")
    ignore_list = {'.git', '.github', OUTPUT_DIR, 'generate_site.py', 'template.html', 'firebase.json', 'README.md', '__pycache__'}
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

# --- ФУНКЦИИ ГЕНЕРАЦИИ SITEMAP.XML (С УЛУЧШЕННОЙ НАДЕЖНОСТЬЮ) ---

def build_url_for_sitemap(page):
    lang_prefix = f"/{page['lang']}" if page['lang'] != 'en' else '/en'
    slug = page['urlSlug']
    if not slug.endswith('/'):
        slug += '/'
    return f"{BASE_URL}{lang_prefix}/{page['collection_name']}/{slug}"

def generate_sitemap_xml(pages_for_sitemap):
    urlset = Element('urlset', xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    urlset.set('xmlns:xhtml', "http://www.w3.org/1999/xhtml")
    today = date.today().isoformat()

    home_urls = [f"{BASE_URL}/"] + [f"{BASE_URL}/{lang}/" for lang in SUPPORTED_LANGS if lang != 'en']
    for url_loc in home_urls:
        url_el = SubElement(urlset, 'url')
        SubElement(url_el, 'loc').text = url_loc
        SubElement(url_el, 'lastmod').text = today
        SubElement(url_el, 'changefreq').text = SITEMAP_CONFIG['home']['changefreq']
        SubElement(url_el, 'priority').text = SITEMAP_CONFIG['home']['priority']
        SubElement(url_el, 'xhtml:link', rel="alternate", hreflang="x-default", href=f"{BASE_URL}/")
        for lang in SUPPORTED_LANGS:
            lang_href = f"{BASE_URL}/{lang}/" if lang != 'en' else f"{BASE_URL}/"
            SubElement(url_el, 'xhtml:link', rel="alternate", hreflang=lang, href=lang_href)

    # Группируем страницы по переводам
    grouped = {}
    for page in pages_for_sitemap:
        key = page.get('translationGroupKey') or page.get('id')
        if key not in grouped: grouped[key] = []
        grouped[key].append(page)

    for group_key, pages_in_group in grouped.items():
        hreflang_map = {p['lang']: build_url_for_sitemap(p) for p in pages_in_group}
        for page in pages_in_group:
            url_el = SubElement(urlset, 'url')
            SubElement(url_el, 'loc').text = build_url_for_sitemap(page)
            SubElement(url_el, 'lastmod').text = today
            config = SITEMAP_CONFIG.get(page['collection_name'], {'changefreq': 'monthly', 'priority': '0.6'})
            SubElement(url_el, 'changefreq').text = config['changefreq']
            SubElement(url_el, 'priority').text = config['priority']

            if len(hreflang_map) > 1:
                for lang_code, url in hreflang_map.items():
                    SubElement(url_el, 'xhtml:link', rel="alternate", hreflang=lang_code, href=url)

    xml_string = tostring(urlset, 'utf-8')
    pretty_xml = minidom.parseString(xml_string).toprettyxml(indent="  ")
    output_path = os.path.join(OUTPUT_DIR, 'sitemap.xml')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(pretty_xml)
    print(f"✓ Карта сайта успешно сгенерирована: {output_path}")

# --- ОСНОВНАЯ ФУНКЦИЯ ЗАПУСКА ---

def main():
    all_data = get_all_data()
    if not all_data:
        print("Не удалось получить данные. Генерация сайта отменена.")
        return

    generate_home_and_copy_assets()

    valid_pages_for_sitemap = []
    collections_to_generate = ['services', 'portfolio', 'blog', 'contact']

    for collection in collections_to_generate:
        if collection in all_data:
            for item in all_data[collection]:
                # ==============================================================================
                # ИСПРАВЛЕНИЕ 2: БОЛЕЕ НАДЕЖНАЯ ПРОВЕРКА ДАННЫХ ПЕРЕД ГЕНЕРАЦИЕЙ
                # ==============================================================================
                if item.get('urlSlug') and item.get('lang'):
                    # Если данные валидны, генерируем страницу и добавляем в список для sitemap
                    generate_detail_page(item, all_data)
                    valid_pages_for_sitemap.append(item)
                else:
                    # Если не хватает ключевых полей, выводим предупреждение и пропускаем
                    print(f"[WARNING] Пропущен элемент в '{collection}' (ID: {item.get('id', 'N/A')}) из-за отсутствия 'urlSlug' или 'lang'. Сборка продолжается.")

    print("\nПодготовка данных для sitemap.xml...")
    if valid_pages_for_sitemap:
        generate_sitemap_xml(valid_pages_for_sitemap)
    else:
        print("! Не найдено валидных страниц для создания sitemap.xml.")

    print("\nГенерация сайта полностью завершена!")


if __name__ == '__main__':
    main()
