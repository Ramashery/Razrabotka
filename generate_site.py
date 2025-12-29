print("!!! ВЫПОЛНЯЕТСЯ НОВАЯ ВЕРСИЯ ФАЙЛА generate_site.py !!!")
import os
import json
import re
import shutil
from datetime import date, datetime
from lxml import etree as ET
import firebase_admin
from firebase_admin import credentials, firestore
from jinja2 import Environment, FileSystemLoader

# --- НАСТРОЙКА ---
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

env = Environment(loader=FileSystemLoader('.'))
home_template = env.get_template('home_template.html')
detail_template = env.get_template('template.html')

OUTPUT_DIR = 'public'
BASE_URL = "https://digital-craft-tbilisi.site"
SUPPORTED_LANGS = ['en', 'ka', 'ru', 'ua']
SITEMAP_DEFAULTS = {
    'home': {'priority': '1.0', 'changefreq': 'weekly'},
    'services': {'priority': '0.9', 'changefreq': 'monthly'},
    'portfolio': {'priority': '0.8', 'changefreq': 'yearly'},
    'blog': {'priority': '0.7', 'changefreq': 'monthly'},
    'contact': {'priority': '0.5', 'changefreq': 'yearly'},
}

if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Функции для получения данных и рендеринга страниц ---
def get_all_data():
    site_data = {}
    try:
        home_doc = db.collection('home').document('content').get()
        if home_doc.exists:
            site_data['home'] = home_doc.to_dict()
            print(f"Загружены данные главной страницы: {site_data['home'].keys()}")
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
                # Отладка: печатаем ключевые поля
                if 'translationGroupKey' in doc_data:
                    print(f"  Найден translationGroupKey для {col}/{doc.id}: {doc_data['translationGroupKey']}")
                site_data[col].append(doc_data)
            print(f"Загружено {len(site_data[col])} элементов из коллекции {col}")
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
            html_parts.append('<p>' + trimmed_block.replace('\n', '<br>') + '</p>')
    return '\n'.join(html_parts)

def generate_home_page(all_data):
    try:
        home_data = all_data.get('home')
        sections_data = {
            'services': all_data.get('services', []),
            'portfolio': all_data.get('portfolio', []),
            'blog': all_data.get('blog', []),
            'contact': all_data.get('contact', [])
        }
        html_content = home_template.render(home=home_data, sections_data=sections_data)
        with open(os.path.join(OUTPUT_DIR, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html_content)
        for lang in SUPPORTED_LANGS:
            if lang != 'en':
                os.makedirs(os.path.join(OUTPUT_DIR, lang), exist_ok=True)
        print("✓ Главная страница и структура папок для языков успешно сгенерированы.")
    except Exception as e:
        print(f"[ERROR] Ошибка при генерации главной страницы: {e}")

def generate_detail_page(item, all_data):
    collection_name = item['collection_name']
    lang = item.get('lang', 'en')
    slug = item['urlSlug']
    path = os.path.join(OUTPUT_DIR, lang, collection_name, slug, 'index.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        related_items = []
        pool = all_data.get('services', []) + all_data.get('blog', [])
        for related_item in pool:
            if len(related_items) >= 3:
                break
            if related_item.get('lang') == lang and related_item.get('urlSlug') != slug and 'urlSlug' in related_item:
                related_items.append(related_item)
        html_content = detail_template.render(item=item, related_items=related_items, format_content=format_content)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"✓ Создана страница: {os.path.join(lang, collection_name, slug)}")
    except Exception as e:
        print(f"[ERROR] Ошибка при рендере страницы {collection_name}/{slug}: {e}")

def copy_static_assets():
    print("\nНачинаю копирование ассетов...")
    ignore_list = {
        '.git', '.github', OUTPUT_DIR, 'generate_site.py', 'test_sitemap_data.py',
        'template.html', 'home_template.html', 'firebase.json', 'README.md',
        '__pycache__', 'index.html', 'page.html', 'admin.txt', 'main.txt', 'sitemap.xml'
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
                print(f"Не удалось скопировать {item_name}: {e}")
    print("Копирование ассетов завершено.")

# --- ФУНКЦИЯ ПОСТРОЕНИЯ URL ---
def build_url_for_sitemap(page):
    """Строит URL для sitemap."""
    lang = page.get('lang', 'en')
    collection_name = page.get('collection_name', '')
    slug = page.get('urlSlug', '')
    
    # Для главной страницы
    if collection_name == 'home':
        if lang == 'en':
            return f"{BASE_URL}/"
        else:
            return f"{BASE_URL}/{lang}/"
    
    # Для внутренних страниц
    return f"{BASE_URL}/{lang}/{collection_name}/{slug}/"

# --- ФУНКЦИЯ ГЕНЕРАЦИИ SITEMAP ---
def generate_sitemap_xml(pages_for_sitemap, all_data):
    print("\n" + "="*60)
    print("НАЧАЛО ГЕНЕРАЦИИ SITEMAP")
    print("="*60)
    
    SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
    XHTML_NS = "http://www.w3.org/1999/xhtml"
    NSMAP = {None: SITEMAP_NS, "xhtml": XHTML_NS}
    
    urlset = ET.Element("urlset", nsmap=NSMAP)
    
    # === ГЛАВНЫЕ СТРАНИЦЫ (HOME) ===
    print("\n1. Генерация главных страниц...")
    home_data = all_data.get('home', {})
    home_lastmod_iso = home_data.get('lastModified')
    home_lastmod = datetime.fromisoformat(home_lastmod_iso.replace("Z", "+00:00")).strftime('%Y-%m-%d') if home_lastmod_iso else date.today().isoformat()
    print(f"   lastmod для главной: {home_lastmod}")
    
    # Создаем главные страницы для всех языков
    home_pages = [
        {'lang': 'en', 'url': f"{BASE_URL}/", 'collection_name': 'home'},
        {'lang': 'ka', 'url': f"{BASE_URL}/ka/", 'collection_name': 'home'},
        {'lang': 'ru', 'url': f"{BASE_URL}/ru/", 'collection_name': 'home'},
        {'lang': 'ua', 'url': f"{BASE_URL}/ua/", 'collection_name': 'home'}
    ]
    
    for home_page in home_pages:
        url_el = ET.SubElement(urlset, "url")
        ET.SubElement(url_el, "loc").text = home_page['url']
        ET.SubElement(url_el, "lastmod").text = home_lastmod
        ET.SubElement(url_el, "changefreq").text = 'weekly'
        ET.SubElement(url_el, "priority").text = '1.0'
        
        print(f"   Добавлена главная страница: {home_page['url']}")
        
        # Добавляем hreflang для всех языков
        for hreflang_page in home_pages:
            lang_code = hreflang_page['lang']
            if lang_code == 'en':
                # Для английской версии также x-default
                ET.SubElement(url_el, f"{{{XHTML_NS}}}link", 
                            rel="alternate", 
                            hreflang="x-default", 
                            href=hreflang_page['url'])
            ET.SubElement(url_el, f"{{{XHTML_NS}}}link", 
                         rel="alternate", 
                         hreflang=lang_code, 
                         href=hreflang_page['url'])

    # === ВНУТРЕННИЕ СТРАНИЦЫ ===
    print(f"\n2. Обработка {len(pages_for_sitemap)} внутренних страниц...")
    
    # Удаляем главную страницу из списка, если она там есть
    pages_for_sitemap = [p for p in pages_for_sitemap if p.get('collection_name') != 'home']
    
    # Группируем по translationGroupKey
    grouped = {}
    loners = []
    
    for page in pages_for_sitemap:
        key = page.get('translationGroupKey')
        if key:
            grouped.setdefault(key, []).append(page)
        else:
            loners.append(page)
    
    print(f"   Найдено {len(grouped)} групп по translationGroupKey")
    print(f"   Найдено {len(loners)} отдельных страниц без группы")
    
    # Обрабатываем сгруппированные страницы
    for group_key, pages_in_group in grouped.items():
        print(f"\n   Обработка группы '{group_key}' ({len(pages_in_group)} страниц):")
        
        # Собираем все URL в этой группе
        hreflang_map = {}
        for page in pages_in_group:
            lang = page.get('lang', 'en')
            if lang:
                hreflang_map[lang] = build_url_for_sitemap(page)
                print(f"     Язык {lang}: {hreflang_map[lang]}")
        
        # Создаем запись для каждой страницы в группе
        for page in pages_in_group:
            url_el = ET.SubElement(urlset, "url")
            
            # URL страницы
            loc = build_url_for_sitemap(page)
            ET.SubElement(url_el, "loc").text = loc
            
            # Lastmod
            last_mod_str = page.get('lastModified')
            if last_mod_str:
                try:
                    lastmod = datetime.fromisoformat(last_mod_str.replace("Z", "+00:00")).strftime('%Y-%m-%d')
                except:
                    lastmod = date.today().isoformat()
            else:
                lastmod = date.today().isoformat()
            ET.SubElement(url_el, "lastmod").text = lastmod
            
            # Changefreq и Priority
            changefreq = page.get('sitemapChangefreq')
            priority = page.get('sitemapPriority')
            
            if not changefreq:
                changefreq = SITEMAP_DEFAULTS.get(page['collection_name'], {}).get('changefreq', 'monthly')
            if not priority:
                priority = SITEMAP_DEFAULTS.get(page['collection_name'], {}).get('priority', '0.6')
            
            ET.SubElement(url_el, "changefreq").text = changefreq
            ET.SubElement(url_el, "priority").text = str(priority)
            
            print(f"     Добавлена страница: {loc}")
            print(f"       lastmod: {lastmod}, changefreq: {changefreq}, priority: {priority}")
            
            # Добавляем hreflang только если есть другие языковые версии
            if len(hreflang_map) > 1:
                for lang_code, url in hreflang_map.items():
                    ET.SubElement(url_el, f"{{{XHTML_NS}}}link", 
                                 rel="alternate", 
                                 hreflang=lang_code, 
                                 href=url)
                print(f"       Добавлены hreflang: {list(hreflang_map.keys())}")
    
    # Обрабатываем отдельные страницы (без группы)
    if loners:
        print(f"\n3. Обработка {len(loners)} отдельных страниц:")
        for page in loners:
            url_el = ET.SubElement(urlset, "url")
            
            # URL страницы
            loc = build_url_for_sitemap(page)
            ET.SubElement(url_el, "loc").text = loc
            
            # Lastmod
            last_mod_str = page.get('lastModified')
            if last_mod_str:
                try:
                    lastmod = datetime.fromisoformat(last_mod_str.replace("Z", "+00:00")).strftime('%Y-%m-%d')
                except:
                    lastmod = date.today().isoformat()
            else:
                lastmod = date.today().isoformat()
            ET.SubElement(url_el, "lastmod").text = lastmod
            
            # Changefreq и Priority
            changefreq = page.get('sitemapChangefreq')
            priority = page.get('sitemapPriority')
            
            if not changefreq:
                changefreq = SITEMAP_DEFAULTS.get(page['collection_name'], {}).get('changefreq', 'monthly')
            if not priority:
                priority = SITEMAP_DEFAULTS.get(page['collection_name'], {}).get('priority', '0.6')
            
            ET.SubElement(url_el, "changefreq").text = changefreq
            ET.SubElement(url_el, "priority").text = str(priority)
            
            print(f"   Добавлена отдельная страница: {loc}")

    # Сохраняем XML
    xml_string = ET.tostring(urlset, pretty_print=True, xml_declaration=True, encoding='UTF-8')
    output_path = os.path.join(OUTPUT_DIR, 'sitemap.xml')
    with open(output_path, 'wb') as f:
        f.write(xml_string)
    
    print(f"\n" + "="*60)
    print(f"✓ Sitemap успешно сгенерирован: {output_path}")
    print(f"Всего URL в sitemap: {len(urlset)}")
    print("="*60)

# --- Основная функция ---
def main():
    all_data = get_all_data()
    if not all_data:
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
    
    print("\n" + "="*60)
    print(f"Подготовка данных для sitemap.xml...")
    print(f"Найдено {len(valid_pages_for_sitemap)} валидных страниц")
    
    # Проверяем данные
    for i, page in enumerate(valid_pages_for_sitemap[:5]):  # Покажем первые 5 для примера
        print(f"Страница {i+1}: {page.get('collection_name')}/{page.get('urlSlug')}")
        print(f"  Язык: {page.get('lang')}")
        print(f"  translationGroupKey: {page.get('translationGroupKey')}")
        print(f"  sitemapPriority: {page.get('sitemapPriority')}")
        print(f"  sitemapChangefreq: {page.get('sitemapChangefreq')}")
        print(f"  lastModified: {page.get('lastModified')}")
    
    if valid_pages_for_sitemap:
        generate_sitemap_xml(valid_pages_for_sitemap, all_data)
    else:
        print("! Не найдено валидных страниц для создания sitemap.xml.")
    
    print("\nГенерация сайта полностью завершена!")

if __name__ == '__main__':
    main()
