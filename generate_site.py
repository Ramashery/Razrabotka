import os
import json
import shutil
import firebase_admin
from firebase_admin import credentials, firestore
from jinja2 import Environment, FileSystemLoader
from datetime import datetime

# --- НАСТРОЙКИ ---
BASE_URL = "https://digital-craft-tbilisi.site"
OUTPUT_DIR = 'public'

# Инициализация Firebase
try:
    service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
    cred = credentials.Certificate(service_account_info)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase connected successfully.")
except Exception as e:
    print(f"❌ Firebase connection error: {e}")
    exit(1)

# Настройка шаблонизатора Jinja2
env = Environment(loader=FileSystemLoader('.'))
detail_template = env.get_template('template.html')

# Функция форматирования текста (чтобы не было ошибки в шаблоне)
def format_content(content_string):
    if not content_string:
        return ""
    # Превращаем обычные переносы строк в HTML-переносы
    return str(content_string).replace('\n', '<br>')

# --- ФУНКЦИИ СБОРА ДАННЫХ ---

def get_all_data():
    site_data = {}
    try:
        # Загружаем контент для главной страницы
        home_doc = db.collection('home').document('content').get()
        site_data['home'] = home_doc.to_dict() if home_doc.exists else {}

        # Загружаем все остальные коллекции
        collections = ['services', 'portfolio', 'blog', 'contact']
        for col in collections:
            docs = db.collection(col).stream()
            site_data[col] = []
            for doc in docs:
                data = doc.to_dict()
                data['collection_name'] = col
                # Обработка JSON-LD если он есть
                if 'schemaJsonLd' in data and isinstance(data['schemaJsonLd'], str):
                    try:
                        data['schemaJsonLd'] = json.loads(data['schemaJsonLd'])
                    except:
                        pass
                site_data[col].append(data)
        return site_data
    except Exception as e:
        print(f"❌ Error fetching data: {e}")
        return None

# --- ФУНКЦИИ ГЕНЕРАЦИИ ---

def generate_static_file(item, all_data, template_name, is_home=False):
    """Генерирует HTML файл для конкретной страницы"""
    lang = item.get('lang', 'en')
    col = item.get('collection_name', 'home')
    slug = item.get('urlSlug', '')

    # Определяем путь к файлу
    if is_home:
        # Главная: /index.html (для en) или /{lang}/index.html
        sub_path = '' if lang == 'en' else lang
    else:
        # Внутренние: /{lang}/{collection}/{slug}/
        lang_part = lang if lang != 'en' else 'en'
        sub_path = os.path.join(lang_part, col, slug)

    target_dir = os.path.join(OUTPUT_DIR, sub_path)
    os.makedirs(target_dir, exist_ok=True)
    file_path = os.path.join(target_dir, 'index.html')

    try:
        tmpl = env.get_template(template_name)
        html = tmpl.render(
            item=item,
            site_data=all_data,
            lang=lang,
            format_content=format_content, # ПЕРЕДАЕМ ФУНКЦИЮ В ШАБЛОН
            now=datetime.now()
        )
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"  📄 Generated: {file_path}")
    except Exception as e:
        print(f"  ❌ Error rendering {file_path}: {e}")

def generate_sitemap(all_data):
    """Создает sitemap.xml на основе всех данных"""
    print("🛠 Generating sitemap.xml...")
    now = datetime.now().strftime("%Y-%m-%d")
    urls = []

    # 1. Главные страницы
    for lang in ['en', 'ka', 'ru', 'ua']:
        loc = f"{BASE_URL}/" if lang == 'en' else f"{BASE_URL}/{lang}/"
        urls.append(f"    <url><loc>{loc}</loc><lastmod>{now}</lastmod><priority>1.0</priority></url>")

    # 2. Внутренние страницы
    col_settings = {'services': '0.9', 'portfolio': '0.8', 'blog': '0.7', 'contact': '0.5'}
    for col, priority in col_settings.items():
        for item in all_data.get(col, []):
            lang = item.get('lang', 'en')
            slug = item.get('urlSlug')
            if slug:
                loc = f"{BASE_URL}/{lang}/{col}/{slug}/"
                urls.append(f"    <url><loc>{loc}</loc><lastmod>{now}</lastmod><priority>{priority}</priority></url>")

    sitemap_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{os.linesep.join(urls)}
</urlset>"""

    with open(os.path.join(OUTPUT_DIR, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write(sitemap_content)

def copy_assets():
    """Копирует CSS, JS, картинки в папку public"""
    print("📂 Copying assets...")
    ignore_list = ['generate_site.py', 'template.html', 'index.html', 'public', '.git', '.github']
    for item in os.listdir('.'):
        if item not in ignore_list and not item.startswith('.'):
            s = os.path.join('.', item)
            d = os.path.join(OUTPUT_DIR, item)
            if os.path.isdir(s):
                shutil.copytree(s, d, dirs_exist_ok=True)
            else:
                shutil.copy2(s, d)

# --- ГЛАВНЫЙ ЗАПУСК ---

def main():
    # Очистка папки сборки
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR)

    all_data = get_all_data()
    if not all_data:
        return

    # 1. Генерируем главную (используем index.html как шаблон)
    print("🏠 Generating Home pages...")
    # Если в Firebase только один объект home, генерируем одну версию.
    # Если у вас будут разные языки для главной в базе, тут нужен будет цикл.
    home_data = all_data.get('home', {})
    generate_static_file(home_data, all_data, 'index.html', is_home=True)

    # 2. Генерируем внутренние страницы (Services, Portfolio, Blog, Contact)
    print("📑 Generating internal pages...")
    for col in ['services', 'portfolio', 'blog', 'contact']:
        for item in all_data.get(col, []):
            generate_static_file(item, all_data, 'template.html')

    # 3. Ассеты и Sitemap
    copy_assets()
    generate_sitemap(all_data)

    print(f"\n✅ Done! Static site is ready in /{OUTPUT_DIR}")

if __name__ == '__main__':
    main()
