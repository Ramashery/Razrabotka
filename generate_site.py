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
    print("✓ Подключение к Firebase успешно.")
except Exception as e:
    print(f"✗ ОШИБКА ПОДКЛЮЧЕНИЯ к Firebase: {e}")
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
    print(f"✓ Удалена старая папка '{OUTPUT_DIR}'.")
os.makedirs(OUTPUT_DIR, exist_ok=True)
print(f"✓ Создана папка '{OUTPUT_DIR}'.")

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

        collections = ['services', 'portfolio', 'blog', 'contact']
        for col in collections:
            docs = db.collection(col).stream()
            site_data[col] = []
            for doc in docs:
                doc_data = doc.to_dict()
                doc_data['id'] = doc.id
                doc_data['collection_name'] = col
                
                # Попытка парсинга schemaJsonLd
                if 'schemaJsonLd' in doc_data and isinstance(doc_data['schemaJsonLd'], str):
                    try:
                        doc_data['schemaJsonLd'] = json.loads(doc_data['schemaJsonLd'])
                    except json.JSONDecodeError:
                        print(f"  [ПРЕДУПРЕЖДЕНИЕ] Не удалось разобрать schemaJsonLd для {col}/{doc.id}. Оставлено как строка.")
                        doc_data['schemaJsonLd'] = {} # Или оставить как строку, если это допустимо
                
                site_data[col].append(doc_data)
            print(f"✓ Загружено {len(site_data[col])} документов из коллекции '{col}'.")
        
        print("✓ Все данные из Firestore успешно загружены.")
        return site_data
    except Exception as e:
        print(f"✗ Критическая ОШИБКА при загрузке данных из Firestore: {e}")
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
        
        # Создание языковых папок для внутренних страниц (для правильной структуры URL),
        # но без создания index.html для них, так как главная страница только одна.
        for lang in SUPPORTED_LANGS:
            if lang != 'en': # Основная домашняя страница уже обработана
                lang_dir = os.path.join(OUTPUT_DIR, lang)
                os.makedirs(lang_dir, exist_ok=True)
        print("✓ Главная страница (основная) и языковые папки для внутренних страниц успешно сгенерированы.")
    except Exception as e:
        print(f"✗ ОШИБКА при генерации главной страницы: {e}")

def generate_detail_page(item, all_data):
    collection_name = item['collection_name']
    lang = item.get('lang', 'en')
    slug = item['urlSlug']
    path = os.path.join(OUTPUT_DIR, lang, collection_name, slug, 'index.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        related_items = []
        # Фильтруем связанные элементы по языку и исключаем текущий
        pool = all_data.get('services', []) + all_data.get('blog', []) + all_data.get('portfolio', [])
        for related_item in pool:
            if len(related_items) >= 3: # Ограничиваем количество связанных элементов
                break
            if (related_item.get('lang') == lang and 
                related_item.get('urlSlug') != slug and 
                'urlSlug' in related_item and 
                related_item.get('collection_name') != collection_name): # Избегаем показывать статьи из той же коллекции, если их слишком много
                related_items.append(related_item)
        
        html_content = detail_template.render(item=item, related_items=related_items, format_content=format_content)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"  ✓ Создана страница: {os.path.join(lang, collection_name, slug)}")
    except Exception as e:
        print(f"✗ ОШИБКА при рендере страницы {collection_name}/{slug}: {e}")

def copy_static_assets():
    print("\nНачинаю копирование статических файлов (CSS, JS, и т.д.)...")
    ignore_list = {
        '.git', '.github', OUTPUT_DIR, 'generate_site.py', 'test_sitemap_data.py',
        'template.html', 'home_template.html', 'firebase.json', 'README.md',
        '__pycache__', 'index.html', 'page.html', 'admin.txt', 'main.txt', 'sitemap.xml',
        'package.json', 'package-lock.json', 'node_modules'
    }
    for item_name in os.listdir('.'):
        if item_name not in ignore_list:
            source_path = os.path.join('.', item_name)
            dest_path = os.path.join(OUTPUT_DIR, item_name)
            try:
                if os.path.isfile(source_path):
                    shutil.copy2(source_path, dest_path)
                    # print(f"    Копирование файла: {item_name}")
                elif os.path.isdir(source_path):
                    shutil.copytree(source_path, dest_path, dirs_exist_ok=True)
                    # print(f"    Копирование папки: {item_name}")
            except Exception as e:
                print(f"✗ Не удалось скопировать '{item_name}': {e}")
    print("✓ Копирование статических файлов завершено.")

# --- ФУНКЦИЯ ПОСТРОЕНИЯ URL ---
def build_url_for_sitemap(page):
    """Строит URL для sitemap."""
    lang = page.get('lang', 'en')
    collection_name = page.get('collection_name', '')
    slug = page.get('urlSlug', '')
    
    # Для главной страницы (теперь она всегда без языкового префикса)
    if collection_name == 'home':
        return f"{BASE_URL}/"
    
    # Для внутренних страниц (с языковым префиксом)
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
    
    # === 1. ГЛАВНАЯ СТРАНИЦА (ТОЛЬКО ОДНА, БЕЗ HREFLANG) ===
    print("1. Добавляю главную страницу (только EN/x-default, без hreflang)...")
    home_data = all_data.get('home', {})
    home_lastmod_iso = home_data.get('lastModified')
    
    # Более надежный парсинг даты
    home_lastmod = date.today().isoformat()
    if home_lastmod_iso:
        try:
            home_lastmod = datetime.fromisoformat(home_lastmod_iso.replace("Z", "+00:00")).strftime('%Y-%m-%d')
        except ValueError:
            print(f"  [ПРЕДУПРЕЖДЕНИЕ] Не удалось разобрать дату 'lastModified' для главной страницы ({home_lastmod_iso}). Используется текущая дата.")

    # Создаем ТОЛЬКО ОДНУ запись для базовой главной страницы
    url_el = ET.SubElement(urlset, "url")
    
    loc_el = ET.SubElement(url_el, "loc")
    loc_el.text = f"{BASE_URL}/" # Только базовый URL
    
    lastmod_el = ET.SubElement(url_el, "lastmod")
    lastmod_el.text = home_lastmod
    
    changefreq_el = ET.SubElement(url_el, "changefreq")
    changefreq_el.text = SITEMAP_DEFAULTS['home']['changefreq']
    
    priority_el = ET.SubElement(url_el, "priority")
    priority_el.text = SITEMAP_DEFAULTS['home']['priority']
    
    # >>> HREFLANG ДЛЯ ГЛАВНОЙ СТРАНИЦЫ БОЛЬШЕ НЕ ДОБАВЛЯЕТСЯ <<<
    
    print(f"   ✓ Главная страница: {BASE_URL}/ (lastmod: {home_lastmod})")
    
    # === 2. ВНУТРЕННИЕ СТРАНИЦЫ ===
    print(f"\n2. Обрабатываю {len(pages_for_sitemap)} внутренних страниц...")
    
    # Удаляем главную страницу из списка, если она там есть (чтобы избежать дублирования)
    pages_for_sitemap = [p for p in pages_for_sitemap if p.get('collection_name') != 'home']
    
    # Группируем по translationGroupKey
    grouped = {}
    loners = [] # Страницы без translationGroupKey
    
    for page in pages_for_sitemap:
        key = page.get('translationGroupKey')
        # Проверяем, что ключ существует и не пустой
        if key is not None and str(key).strip() != '': # Убрал 'None' как строку, т.к. NoneType не будет strip
            group_key_str = str(key).strip() # Преобразуем в строку и очищаем
            grouped.setdefault(group_key_str, []).append(page)
        else:
            loners.append(page)
    
    print(f"   Найдено {len(grouped)} групп страниц.")
    for key in grouped:
        print(f"   Группа '{key}': {len(grouped[key])} страниц")
    print(f"   Найдено {len(loners)} отдельных страниц (без translationGroupKey).")
    
    # === 3. ОБРАБАТЫВАЕМ СГРУППИРОВАННЫЕ СТРАНИЦЫ ===
    total_grouped_pages = 0
    if grouped:
        print("\n3.1. Обработка сгруппированных страниц...")
    else:
        print("\n3.1. Группированных страниц не найдено.")
        
    for group_key, pages_in_group in grouped.items():
        if not pages_in_group:
            continue
            
        print(f"\n   Обработка группы '{group_key}' ({len(pages_in_group)} страниц):")
        
        # Собираем все URL в этой группе по языкам для hreflang
        hreflang_map = {}
        for page_in_group in pages_in_group:
            lang = page_in_group.get('lang')
            if lang and lang in SUPPORTED_LANGS:
                hreflang_map[lang] = build_url_for_sitemap(page_in_group)
        
        # Создаем запись для каждой страницы в группе
        for page in pages_in_group:
            url_el = ET.SubElement(urlset, "url")
            
            # URL страницы
            loc = build_url_for_sitemap(page)
            loc_el = ET.SubElement(url_el, "loc")
            loc_el.text = loc
            
            # Lastmod
            last_mod_str = page.get('lastModified')
            lastmod = date.today().isoformat()
            if last_mod_str:
                try:
                    # Учитываем, что fromisoformat может не всегда требовать replace "+00:00"
                    lastmod = datetime.fromisoformat(last_mod_str.replace("Z", "+00:00")).strftime('%Y-%m-%d')
                except ValueError:
                    print(f"    [ПРЕДУПРЕЖДЕНИЕ] Не удалось разобрать дату 'lastModified' для {loc} ({last_mod_str}). Используется текущая дата.")
            lastmod_el = ET.SubElement(url_el, "lastmod")
            lastmod_el.text = lastmod
            
            # Changefreq и Priority
            changefreq_el = ET.SubElement(url_el, "changefreq")
            priority_el = ET.SubElement(url_el, "priority")
            
            changefreq = page.get('sitemapChangefreq')
            priority = page.get('sitemapPriority')
            
            # Применяем значения по умолчанию, если они не заданы или некорректны
            if not changefreq or changefreq not in ['monthly', 'daily', 'weekly', 'yearly', 'always', 'hourly', 'never']:
                changefreq = SITEMAP_DEFAULTS.get(page.get('collection_name'), {}).get('changefreq', 'monthly')
            if not priority or not (isinstance(priority, (int, float)) or (isinstance(priority, str) and priority.replace('.', '', 1).isdigit())):
                priority = SITEMAP_DEFAULTS.get(page.get('collection_name'), {}).get('priority', '0.6')
            
            changefreq_el.text = str(changefreq)
            priority_el.text = str(priority)
            
            print(f"     ✓ Добавлена страница: {loc} (lang: {page.get('lang')}, lastmod: {lastmod}, priority: {priority})")
            
            # Добавляем hreflang только если есть другие языковые версии
            if len(hreflang_map) > 1:
                print(f"       (hreflang ссылки для: {', '.join(hreflang_map.keys())})")
                for lang_code, href_url in hreflang_map.items():
                    ET.SubElement(url_el, f"{{{XHTML_NS}}}link", 
                                 rel="alternate", 
                                 hreflang=lang_code, 
                                 href=href_url)
            total_grouped_pages += 1
    
    # === 4. ОБРАБАТЫВАЕМ ОТДЕЛЬНЫЕ СТРАНИЦЫ ===
    if loners:
        print(f"\n3.2. Добавляю {len(loners)} отдельных страниц (без hreflang):")
    else:
        print("\n3.2. Отдельных страниц не найдено.")
        
    for page in loners:
        url_el = ET.SubElement(urlset, "url")
        
        # URL страницы
        loc = build_url_for_sitemap(page)
        loc_el = ET.SubElement(url_el, "loc")
        loc_el.text = loc
        
        # Lastmod
        last_mod_str = page.get('lastModified')
        lastmod = date.today().isoformat()
        if last_mod_str:
            try:
                lastmod = datetime.fromisoformat(last_mod_str.replace("Z", "+00:00")).strftime('%Y-%m-%d')
            except ValueError:
                print(f"    [ПРЕДУПРЕЖДЕНИЕ] Не удалось разобрать дату 'lastModified' для {loc} ({last_mod_str}). Используется текущая дата.")
        lastmod_el = ET.SubElement(url_el, "lastmod")
        lastmod_el.text = lastmod
        
        # Changefreq и Priority
        changefreq_el = ET.SubElement(url_el, "changefreq")
        priority_el = ET.SubElement(url_el, "priority")
        
        changefreq = page.get('sitemapChangefreq')
        priority = page.get('sitemapPriority')
        
        if not changefreq or changefreq not in ['monthly', 'daily', 'weekly', 'yearly', 'always', 'hourly', 'never']:
            changefreq = SITEMAP_DEFAULTS.get(page.get('collection_name'), {}).get('changefreq', 'monthly')
        if not priority or not (isinstance(priority, (int, float)) or (isinstance(priority, str) and priority.replace('.', '', 1).isdigit())):
            priority = SITEMAP_DEFAULTS.get(page.get('collection_name'), {}).get('priority', '0.6')
        
        changefreq_el.text = str(changefreq)
        priority_el.text = str(priority)
        
        print(f"     ✓ Добавлена отдельная страница: {loc} (lang: {page.get('lang')}, lastmod: {lastmod}, priority: {priority})")

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
    print("РЕЗУЛЬТАТ ГЕНЕРАЦИИ SITEMAP")
    print("="*60)
    
    if os.path.exists(output_path):
        file_size = os.path.getsize(output_path)
        
        # Читаем начало файла для проверки
        with open(output_path, 'r', encoding='utf-8') as f:
            first_lines = ''.join([f.readline() for _ in range(10)]) # Читаем больше строк
        
        print(f"✓ Файл создан: {output_path}")
        print(f"✓ Размер файла: {file_size} байт")
        print(f"✓ Всего URL в sitemap: {len(urlset)}")
        print(f"\nПервые строки файла '{output_path}':")
        print("-" * 40)
        print(first_lines)
        print("-" * 40)
        
        # Проверяем, что это XML
        if first_lines.strip().startswith('<?xml'):
            print("✓ Файл начинается с XML декларации.")
        else:
            print("✗ Файл НЕ начинается с XML декларации!")
            
        if '<urlset' in first_lines:
            print("✓ Найден корневой элемент <urlset>.")
        else:
            print("✗ Корневой элемент <urlset> не найден!")
    else:
        print(f"✗ ФАЙЛ НЕ СОЗДАН: {output_path}")

# --- Основная функция ---
def main():
    print("!!! ВЫПОЛНЯЕТСЯ НОВАЯ ВЕРСИЯ ФАЙЛА generate_site.py !!!")
    all_data = get_all_data()
    if not all_data:
        print("✗ Отмена генерации сайта из-за ошибки загрузки данных.")
        return
    
    generate_home_page(all_data)
    
    valid_pages_for_sitemap = []
    collections_to_generate = ['services', 'portfolio', 'blog', 'contact']
    
    print("\nНачинаю генерацию детальных страниц:")
    for collection in collections_to_generate:
        if collection in all_data:
            for item in all_data[collection]:
                # Проверяем обязательные поля для генерации страницы и sitemap
                if item.get('urlSlug') and item.get('lang'):
                    generate_detail_page(item, all_data)
                    valid_pages_for_sitemap.append(item)
                else:
                    print(f"  [ПРЕДУПРЕЖДЕНИЕ] Пропущен элемент в '{collection}' (ID: {item.get('id', 'N/A')}) из-за отсутствия 'urlSlug' или 'lang'.")
        else:
            print(f"  [ПРЕДУПРЕЖДЕНИЕ] Коллекция '{collection}' не найдена в данных Firebase.")
    
    copy_static_assets()
    
    print(f"\n" + "="*60)
    print(f"Подготовка данных для sitemap.xml...")
    print(f"Найдено {len(valid_pages_for_sitemap)} валидных страниц для sitemap.")
    print("="*60)
    
    if valid_pages_for_sitemap:
        generate_sitemap_xml(valid_pages_for_sitemap, all_data)
    else:
        print("! Не найдено валидных страниц для создания sitemap.xml. Файл не будет сгенерирован.")
    # --- ДОБАВЛЕННЫЙ БЛОК: Создание 404.html для поддержки SPA на GitHub Pages ---
print("\nСоздание 404.html для SPA-роутинга...")
index_path = os.path.join(OUTPUT_DIR, 'index.html')
not_found_path = os.path.join(OUTPUT_DIR, '404.html')

if os.path.exists(index_path):
    shutil.copy2(index_path, not_found_path)
    print("✓ Файл 404.html успешно создан как копия index.html.")
else:
    print("✗ ВНИМАНИЕ: Не удалось создать 404.html, так как index.html не найден в папке 'public'.")
# --- КОНЕЦ ДОБАВЛЕННОГО БЛОКА ---
    print("\n" + "="*60)
    print("Генерация сайта полностью завершена!")
    print("="*60)

if __name__ == '__main__':
    main()
