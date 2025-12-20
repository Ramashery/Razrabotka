import os
import json
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
    # Проверяем, не инициализировано ли приложение ранее
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


# --- ФУНКЦИИ ЗАГРУЗКИ ДАННЫХ ---

def get_all_data():
    """Загружает все данные для сайта из Firestore."""
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
                doc_data['id'] = doc.id # Сохраняем ID для ключей в sitemap
                doc_data['collection_name'] = col

                # Безопасная обработка JSON-LD
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


# --- ФУНКЦИИ ГЕНЕРАЦИИ HTML-СТРАНИЦ ---

def format_content(content_string):
    """Форматирует текст для вывода в HTML (пока без изменений)."""
    if not content_string:
        return ""
    return str(content_string)

def generate_detail_page(item, all_data):
    """Генерирует отдельную HTML-страницу для элемента коллекции."""
    collection_name = item['collection_name']
    lang = item.get('lang', 'en')
    slug = item['urlSlug']

    lang_prefix = f"{lang}/" if lang != 'en' else "en/" # Всегда используем en/ для каноничности

    path = os.path.join(OUTPUT_DIR, lang_prefix, collection_name, slug, 'index.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)

    try:
        # Поиск похожих постов
        related_items = []
        pool = all_data.get('services', []) + all_data.get('blog', [])
        for related_item in pool:
            if len(related_items) >= 3:
                break
            if related_item.get('lang') == lang and related_item.get('urlSlug') != slug:
                related_items.append(related_item)

        html_content = template.render(
            page_type='detail',
            item=item,
            related_items=related_items,
            site_data=all_data,
            format_content=format_content
        )

        with open(path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"✓ Создана страница: {os.path.join(lang_prefix, collection_name, slug)}")
    except Exception as e:
        print(f"[ERROR] Ошибка при рендере страницы {collection_name}/{slug}: {e}")

def generate_home_and_copy_assets(all_data):
    """Создает главную страницу и копирует все статические ассеты."""
    home_path = os.path.join(OUTPUT_DIR, 'index.html')
    try:
        shutil.copy2('index.html', home_path)
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


# --- ФУНКЦИИ ГЕНЕРАЦИИ SITEMAP.XML ---

def group_pages_by_translation(pages):
    """Группирует страницы по ключу перевода для hreflang."""
    grouped = {}
    for page in pages:
        key = page.get('translationGroupKey') or page.get('id')
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(page)
    return grouped

def build_url(page):
    """Собирает полный канонический URL для страницы."""
    lang_prefix = f"/{page['lang']}" if page['lang'] != 'en' else '/en'
    slug = page['urlSlug']
    if not slug.endswith('/'):
        slug += '/'
    return f"{BASE_URL}{lang_prefix}/{page['collection']}/{slug}"

def generate_sitemap_xml(all_pages):
    """Создает и сохраняет sitemap.xml на основе всех данных."""
    urlset = Element('urlset', xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    urlset.set('xmlns:xhtml', "http://www.w3.org/1999/xhtml")
    today = date.today().isoformat()

    # 1. Главная страница и ее языковые версии
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

    # 2. Остальные страницы
    grouped_pages = group_pages_by_translation(all_pages)
    for group_key, pages_in_group in grouped_pages.items():
        hreflang_map = {p['lang']: build_url(p) for p in pages_in_group}
        for page in pages_in_group:
            url_el = SubElement(urlset, 'url')
            SubElement(url_el, 'loc').text = build_url(page)
            SubElement(url_el, 'lastmod').text = today
            config = SITEMAP_CONFIG.get(page['collection'], {'changefreq': 'monthly', 'priority': '0.6'})
            SubElement(url_el, 'changefreq').text = config['changefreq']
            SubElement(url_el, 'priority').text = config['priority']

            if len(pages_in_group) > 1:
                for lang_code, url in hreflang_map.items():
                    SubElement(url_el, 'xhtml:link', rel="alternate", hreflang=lang_code, href=url)

    # 3. Форматирование и сохранение файла
    xml_string = tostring(urlset, 'utf-8')
    pretty_xml = minidom.parseString(xml_string).toprettyxml(indent="  ")
    output_path = os.path.join(OUTPUT_DIR, 'sitemap.xml')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(pretty_xml)
    print(f"✓ Карта сайта успешно сгенерирована: {output_path}")


# --- ОСНОВНАЯ ФУНКЦИЯ ЗАПУСКА ---

def main():
    """Главный orchestrator: загружает данные, генерирует страницы, ассеты и sitemap."""
    all_data = get_all_data()
    if not all_data:
        print("Не удалось получить данные. Генерация сайта отменена.")
        return

    # Генерация HTML и копирование ассетов
    generate_home_and_copy_assets(all_data)
    collections_to_generate = ['services', 'portfolio', 'blog', 'contact']
    for collection in collections_to_generate:
        if collection in all_data:
            for item in all_data[collection]:
                if 'urlSlug' in item and 'lang' in item:
                    generate_detail_page(item, all_data)
                else:
                    print(f"[WARNING] Пропущен элемент в '{collection}' из-за отсутствия 'urlSlug' или 'lang'.")

    # Генерация Sitemap
    print("\nПодготовка данных для sitemap.xml...")
    all_pages_for_sitemap = []
    for col_name in collections_to_generate:
         if col_name in all_data and all_data[col_name]:
            for item in all_data[col_name]:
                 if 'urlSlug' in item and 'lang' in item:
                    all_pages_for_sitemap.append(item)
    generate_sitemap_xml(all_pages_for_sitemap)

    print("\nГенерация сайта полностью завершена!")


if __name__ == '__main__':
    main()
