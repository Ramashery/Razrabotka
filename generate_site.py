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

# --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ГЕНЕРАЦИИ SITEMAP (ПОЛНЫЙ XML) ---
def generate_sitemap_xml(pages_for_sitemap, all_data):
    print("\n" + "="*60)
    print("НАЧАЛО ГЕНЕРАЦИИ SITEMAP XML")
    print("="*60)
    
    SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
    XHTML_NS = "http://www.w3.org/1999/xhtml"
    NSMAP = {None: SITEMAP_NS, "xhtml": XHTML_NS}
    
    urlset = ET.Element("urlset", nsmap=NSMAP)
    
    # === 1. ГЛАВНЫЕ СТРАНИЦЫ ===
    print("1. Добавляю главные страницы...")
    home_data = all_data.get('home', {})
    home_lastmod_iso = home_data.get('lastModified')
    home_lastmod = datetime.fromisoformat(home_lastmod_iso.replace("Z", "+00:00")).strftime('%Y-%m-%d') if home_lastmod_iso else date.today().isoformat()
    
    # Главные страницы для всех языков
    home_urls = [
        {'lang': 'en', 'url': f"{BASE_URL}/"},
        {'lang': 'ka', 'url': f"{BASE_URL}/ka/"},
        {'lang': 'ru', 'url': f"{BASE_URL}/ru/"},
        {'lang': 'ua', 'url': f"{BASE_URL}/ua/"}
    ]
    
    for home_page in home_urls:
        url_el = ET.SubElement(urlset, "url")
        
        # Обязательные элементы
        loc_el = ET.SubElement(url_el, "loc")
        loc_el.text = home_page['url']
        
        lastmod_el = ET.SubElement(url_el, "lastmod")
        lastmod_el.text = home_lastmod
        
        changefreq_el = ET.SubElement(url_el, "changefreq")
        changefreq_el.text = 'weekly'
        
        priority_el = ET.SubElement(url_el, "priority")
        priority_el.text = '1.0'
        
        # Добавляем hreflang для ВСЕХ языков главной страницы
        for hreflang_page in home_urls:
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
        
        print(f"   ✓ Главная страница: {home_page['url']}")
    
    # === 2. ВНУТРЕННИЕ СТРАНИЦЫ ===
    print(f"\n2. Обрабатываю {len(pages_for_sitemap)} внутренних страниц...")
    
    # Удаляем главную страницу из списка, если она там есть
    pages_for_sitemap = [p for p in pages_for_sitemap if p.get('collection_name') != 'home']
    
    # Группируем по translationGroupKey
    grouped = {}
    loners = []
    
    for page in pages_for_sitemap:
        key = page.get('translationGroupKey')
        # Проверяем, что ключ существует и не пустой
        if key and str(key).strip() and str(key).strip() != '' and str(key).strip() != 'None':
            grouped.setdefault(str(key).strip(), []).append(page)
        else:
            loners.append(page)
    
    print(f"   Найдено групп: {len(grouped)}")
    for key in grouped:
        print(f"   Группа '{key}': {len(grouped[key])} страниц")
    print(f"   Отдельных страниц: {len(loners)}")
    
    # === 3. ОБРАБАТЫВАЕМ СГРУППИРОВАННЫЕ СТРАНИЦЫ ===
    total_grouped = 0
    for group_key, pages_in_group in grouped.items():
        if not pages_in_group:
            continue
            
        print(f"\n   Обработка группы '{group_key}'...")
        
        # Собираем все URL в этой группе по языкам
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
            loc_el = ET.SubElement(url_el, "loc")
            loc = build_url_for_sitemap(page)
            loc_el.text = loc
            
            # Lastmod
            lastmod_el = ET.SubElement(url_el, "lastmod")
            last_mod_str = page.get('lastModified')
            if last_mod_str:
                try:
                    lastmod = datetime.fromisoformat(last_mod_str.replace("Z", "+00:00")).strftime('%Y-%m-%d')
                except:
                    lastmod = date.today().isoformat()
            else:
                lastmod = date.today().isoformat()
            lastmod_el.text = lastmod
            
            # Changefreq и Priority
            changefreq_el = ET.SubElement(url_el, "changefreq")
            priority_el = ET.SubElement(url_el, "priority")
            
            changefreq = page.get('sitemapChangefreq')
            priority = page.get('sitemapPriority')
            
            if not changefreq:
                changefreq = SITEMAP_DEFAULTS.get(page['collection_name'], {}).get('changefreq', 'monthly')
            if not priority:
                priority = SITEMAP_DEFAULTS.get(page['collection_name'], {}).get('priority', '0.6')
            
            changefreq_el.text = changefreq
            priority_el.text = str(priority)
            
            print(f"     ✓ Добавлена страница: {loc}")
            print(f"       lastmod: {lastmod}, changefreq: {changefreq}, priority: {priority}")
            
            # Добавляем hreflang только если есть другие языковые версии
            if len(hreflang_map) > 1:
                for lang_code, url in hreflang_map.items():
                    ET.SubElement(url_el, f"{{{XHTML_NS}}}link", 
                                 rel="alternate", 
                                 hreflang=lang_code, 
                                 href=url)
                print(f"       Добавлены hreflang: {list(hreflang_map.keys())}")
            
            total_grouped += 1
    
    # === 4. ОБРАБАТЫВАЕМ ОТДЕЛЬНЫЕ СТРАНИЦЫ ===
    print(f"\n3. Добавляю {len(loners)} отдельных страниц...")
    for page in loners:
        url_el = ET.SubElement(urlset, "url")
        
        # URL страницы
        loc_el = ET.SubElement(url_el, "loc")
        loc = build_url_for_sitemap(page)
        loc_el.text = loc
        
        # Lastmod
        lastmod_el = ET.SubElement(url_el, "lastmod")
        last_mod_str = page.get('lastModified')
        if last_mod_str:
            try:
                lastmod = datetime.fromisoformat(last_mod_str.replace("Z", "+00:00")).strftime('%Y-%m-%d')
            except:
                lastmod = date.today().isoformat()
        else:
            lastmod = date.today().isoformat()
        lastmod_el.text = lastmod
        
        # Changefreq и Priority
        changefreq_el = ET.SubElement(url_el, "changefreq")
        priority_el = ET.SubElement(url_el, "priority")
        
        changefreq = page.get('sitemapChangefreq')
        priority = page.get('sitemapPriority')
        
        if not changefreq:
            changefreq = SITEMAP_DEFAULTS.get(page['collection_name'], {}).get('changefreq', 'monthly')
        if not priority:
            priority = SITEMAP_DEFAULTS.get(page['collection_name'], {}).get('priority', '0.6')
        
        changefreq_el.text = changefreq
        priority_el.text = str(priority)
        
        if total_grouped < 2:  # Покажем только первые 2 для отладки
            print(f"   ✓ Отдельная страница: {loc}")

    # === 5. СОХРАНЕНИЕ XML ===
    print(f"\n4. Сохранение XML файла...")
    
    # Создаем XML строку
    xml_string = ET.tostring(urlset, 
                            pretty_print=True, 
                            xml_declaration=True, 
                            encoding='UTF-8')
    
    output_path = os.path.join(OUTPUT_DIR, 'sitemap.xml')
    
    # Записываем файл
    with open(output_path, 'wb') as f:
        f.write(xml_string)
    
    # Проверяем результат
    print(f"\n" + "="*60)
    print("РЕЗУЛЬТАТ ГЕНЕРАЦИИ")
    print("="*60)
    
    if os.path.exists(output_path):
        file_size = os.path.getsize(output_path)
        
        # Читаем начало файла для проверки
        with open(output_path, 'r', encoding='utf-8') as f:
            first_lines = ''.join([f.readline() for _ in range(5)])
        
        print(f"✓ Файл создан: {output_path}")
        print(f"✓ Размер файла: {file_size} байт")
        print(f"✓ Всего URL в sitemap: {len(urlset)}")
        print(f"\nПервые строки файла:")
        print("-" * 40)
        print(first_lines)
        print("-" * 40)
        
        # Проверяем, что это XML
        if first_lines.strip().startswith('<?xml'):
            print("✓ Файл начинается с XML декларации")
        else:
            print("✗ Файл НЕ начинается с XML декларации!")
            
        if '<urlset' in first_lines:
            print("✓ Найден корневой элемент <urlset>")
        else:
            print("✗ Корневой элемент <urlset> не найден!")
    else:
        print(f"✗ ФАЙЛ НЕ СОЗДАН: {output_path}")

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
    
    print(f"\n" + "="*60)
    print(f"Подготовка данных для sitemap.xml...")
    print(f"Найдено {len(valid_pages_for_sitemap)} валидных страниц")
    print("="*60)
    
    # Выводим информацию о группах
    print("\nИнформация о группах:")
    groups_found = {}
    for page in valid_pages_for_sitemap:
        key = page.get('translationGroupKey')
        if key and str(key).strip() and str(key).strip() != '' and str(key).strip() != 'None':
            groups_found.setdefault(str(key).strip(), []).append(page)
    
    for key, pages in groups_found.items():
        print(f"  Группа '{key}': {len(pages)} страниц")
        for page in pages[:3]:  # Покажем первые 3 страницы каждой группы
            print(f"    - {page.get('lang')}: {page.get('collection_name')}/{page.get('urlSlug')}")
    
    if valid_pages_for_sitemap:
        generate_sitemap_xml(valid_pages_for_sitemap, all_data)
    else:
        print("! Не найдено валидных страниц для создания sitemap.xml.")
    
    print("\n" + "="*60)
    print("Генерация сайта полностью завершена!")
    print("="*60)

if __name__ == '__main__':
    main()
