# generate_sitemap.py

import os
import json
from datetime import date
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom
import firebase_admin
from firebase_admin import credentials, firestore

# --- КОНФИГУРАЦИЯ ---
BASE_URL = "https://digital-craft-tbilisi.site"
OUTPUT_DIR = 'public'
SITEMAP_FILENAME = 'sitemap.xml'
SUPPORTED_LANGS = ['en', 'ka', 'ru', 'ua'] # Важно поддерживать этот список актуальным

# Настройки приоритета и частоты обновления для разных разделов
SITEMAP_CONFIG = {
    'home': {'priority': '1.0', 'changefreq': 'weekly'},
    'services': {'priority': '0.9', 'changefreq': 'monthly'},
    'portfolio': {'priority': '0.8', 'changefreq': 'yearly'},
    'blog': {'priority': '0.7', 'changefreq': 'monthly'},
    'contact': {'priority': '0.5', 'changefreq': 'yearly'},
}

def init_firebase():
    """Инициализирует подключение к Firebase."""
    try:
        if not firebase_admin._apps:
            service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
            cred = credentials.Certificate(service_account_info)
            firebase_admin.initialize_app(cred)
        return firestore.client()
    except Exception as e:
        print(f"ОШИБКА ПОДКЛЮЧЕНИЯ к Firebase в generate_sitemap: {e}")
        return None

def fetch_all_pages(db):
    """Загружает все страницы из Firestore."""
    all_pages = []
    collections = ['services', 'portfolio', 'blog', 'contact']
    for col_name in collections:
        try:
            docs = db.collection(col_name).stream()
            for doc in docs:
                page_data = doc.to_dict()
                # Проверяем наличие ключевых полей
                if 'urlSlug' in page_data and 'lang' in page_data:
                    page_data['collection'] = col_name
                    all_pages.append(page_data)
        except Exception as e:
            print(f"Не удалось загрузить коллекцию {col_name}: {e}")
    return all_pages

def group_pages_by_translation(pages):
    """Группирует страницы по ключу перевода."""
    grouped = {}
    for page in pages:
        # Используем 'translationGroupKey'. Если его нет, страница будет в своей собственной группе по 'id'
        key = page.get('translationGroupKey') or page.get('id', page['urlSlug'])
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(page)
    return grouped

def build_url(page):
    """Собирает полный URL для страницы."""
    lang_prefix = f"/{page['lang']}" if page['lang'] != 'en' else ''
    # Убеждаемся, что URL всегда заканчивается на /
    slug = page['urlSlug']
    if not slug.endswith('/'):
        slug += '/'
    return f"{BASE_URL}{lang_prefix}/{page['collection']}/{slug}"

def create_sitemap(all_pages):
    """Создает и сохраняет sitemap.xml."""
    # Настройка корневого элемента <urlset> с пространствами имен
    urlset = Element('urlset', xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    urlset.set('xmlns:xhtml', "http://www.w3.org/1999/xhtml")

    today = date.today().isoformat()

    # 1. Добавляем главную страницу и ее языковые версии
    home_urls = [f"{BASE_URL}/"] + [f"{BASE_URL}/{lang}/" for lang in SUPPORTED_LANGS if lang != 'en']
    for url_loc in home_urls:
        url_element = SubElement(urlset, 'url')
        SubElement(url_element, 'loc').text = url_loc
        SubElement(url_element, 'lastmod').text = today
        SubElement(url_element, 'changefreq').text = SITEMAP_CONFIG['home']['changefreq']
        SubElement(url_element, 'priority').text = SITEMAP_CONFIG['home']['priority']
        
        # Добавляем x-default и все языковые альтернативы
        SubElement(url_element, 'xhtml:link', rel="alternate", hreflang="x-default", href=f"{BASE_URL}/")
        for lang in SUPPORTED_LANGS:
             lang_href = f"{BASE_URL}/{lang}/" if lang != 'en' else f"{BASE_URL}/"
             SubElement(url_element, 'xhtml:link', rel="alternate", hreflang=lang, href=lang_href)

    # 2. Группируем и добавляем остальные страницы
    grouped_pages = group_pages_by_translation(all_pages)
    
    for group_key, group_pages in grouped_pages.items():
        # Создаем карту hreflang для текущей группы
        hreflang_map = {p['lang']: build_url(p) for p in group_pages}

        for page in group_pages:
            url_element = SubElement(urlset, 'url')
            SubElement(url_element, 'loc').text = build_url(page)
            SubElement(url_element, 'lastmod').text = today

            config = SITEMAP_CONFIG.get(page['collection'], {'changefreq': 'monthly', 'priority': '0.6'})
            SubElement(url_element, 'changefreq').text = config['changefreq']
            SubElement(url_element, 'priority').text = config['priority']

            # Добавляем ссылки на альтернативные языковые версии
            if len(group_pages) > 1:
                for lang_code, url in hreflang_map.items():
                    SubElement(url_element, 'xhtml:link', rel="alternate", hreflang=lang_code, href=url)

    # 3. Форматируем и сохраняем XML
    xml_string = tostring(urlset, 'utf-8')
    pretty_xml = minidom.parseString(xml_string).toprettyxml(indent="  ")
    
    output_path = os.path.join(OUTPUT_DIR, SITEMAP_FILENAME)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(pretty_xml)
    
    print(f"✓ Карта сайта успешно сгенерирована: {output_path}")

def main():
    """Основная функция для запуска генератора."""
    print("\nНачинаю генерацию sitemap.xml...")
    db = init_firebase()
    if not db:
        return
    
    all_pages = fetch_all_pages(db)
    if not all_pages:
        print("! Не найдено страниц для генерации sitemap.")
        return

    create_sitemap(all_pages)
    print("Генерация sitemap.xml завершена.")

if __name__ == '__main__':
    main()
