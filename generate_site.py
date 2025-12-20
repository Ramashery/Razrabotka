import os
import json
import shutil
import firebase_admin
from firebase_admin import credentials, firestore
from jinja2 import Environment, FileSystemLoader
from datetime import datetime

# --- НАСТРОЙКА ---
BASE_URL = "https://digital-craft-tbilisi.site"
OUTPUT_DIR = 'public'

try:
    service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
    cred = credentials.Certificate(service_account_info)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase connected.")
except Exception as e:
    print(f"❌ Firebase connection error: {e}")
    exit(1)

# Настройка Jinja2
env = Environment(loader=FileSystemLoader('.'))
detail_template = env.get_template('template.html')
# Для главной будем использовать index.html как шаблон (нужно будет добавить в него пару меток Jinja)
try:
    home_template = env.get_template('index.html')
except:
    home_template = None

# --- ФУНКЦИИ ---

def get_all_data():
    site_data = {}
    try:
        # Загружаем настройки главной (теперь это может быть массив или один док)
        home_doc = db.collection('home').document('content').get()
        site_data['home'] = home_doc.to_dict() if home_doc.exists else {}

        # Загружаем все коллекции
        collections = ['services', 'portfolio', 'blog', 'contact']
        for col in collections:
            docs = db.collection(col).stream()
            site_data[col] = []
            for doc in docs:
                d = doc.to_dict()
                d['collection_name'] = col
                site_data[col].append(d)
        return site_data
    except Exception as e:
        print(f"❌ Error loading data: {e}")
        return None

def generate_page(item, all_data, template_type='detail'):
    """Генерация любой страницы (детальной или главной)"""
    lang = item.get('lang', 'en')
    col = item.get('collection_name', '')
    slug = item.get('urlSlug', '')

    # Определяем путь сохранения
    if col == 'home':
        # Главная: /index.html для en, /{lang}/index.html для остальных
        path = os.path.join(OUTPUT_DIR, 'index.html') if lang == 'en' else os.path.join(OUTPUT_DIR, lang, 'index.html')
    else:
        # Детальные: /{lang}/{col}/{slug}/index.html
        lang_prefix = f"{lang}/" if lang != 'en' else "en/" # Сохраняем вашу структуру с en/
        path = os.path.join(OUTPUT_DIR, lang_prefix, col, slug, 'index.html')

    os.makedirs(os.path.dirname(path), exist_ok=True)

    template = home_template if col == 'home' else detail_template
    
    # Рендерим
    html = template.render(
        item=item,
        site_data=all_data,
        lang=lang,
        now=datetime.now()
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"  📄 Saved: {path}")

def generate_sitemap(all_data):
    """Автоматическая генерация sitemap.xml на основе всех созданных страниц"""
    print("Generated sitemap.xml...")
    now = datetime.now().strftime("%Y-%m-%d")
    urls = []

    # 1. Добавляем главные страницы (предположим стандартный набор языков)
    for lang in ['en', 'ka', 'ru', 'ua']:
        loc = f"{BASE_URL}/" if lang == 'en' else f"{BASE_URL}/{lang}/"
        urls.append(f"<url><loc>{loc}</loc><lastmod>{now}</lastmod><priority>1.0</priority></url>")

    # 2. Добавляем все страницы из коллекций
    col_meta = {
        'services': '0.9',
        'portfolio': '0.8',
        'blog': '0.7',
        'contact': '0.5'
    }

    for col, priority in col_meta.items():
        for item in all_data.get(col, []):
            lang = item.get('lang', 'en')
            slug = item.get('urlSlug')
            if slug:
                loc = f"{BASE_URL}/{lang}/{col}/{slug}/"
                urls.append(f"<url><loc>{loc}</loc><lastmod>{now}</lastmod><priority>{priority}</priority></url>")

    sitemap_xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{"".join(urls)}</urlset>'
    
    with open(os.path.join(OUTPUT_DIR, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write(sitemap_xml)

def copy_assets():
    """Копирование CSS, JS и картинок"""
    for item in os.listdir('.'):
        if item.endswith(('.css', '.js', '.svg', '.png', '.jpg', '.webmanifest')):
            shutil.copy2(item, os.path.join(OUTPUT_DIR, item))

def main():
    if os.path.exists(OUTPUT_DIR): shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR)

    all_data = get_all_data()
    if not all_data: return

    # 1. Генерируем главную (можно адаптировать под разные языки, если в Firebase есть массив home)
    # Пока берем одну версию как в вашем исходнике
    home_item = all_data['home']
    home_item['collection_name'] = 'home'
    generate_page(home_item, all_data)

    # 2. Генерируем все внутренние страницы (включая Контакты)
    for col in ['services', 'portfolio', 'blog', 'contact']:
        for item in all_data.get(col, []):
            generate_page(item, all_data)

    # 3. Ассеты и Sitemap
    copy_assets()
    generate_sitemap(all_data)
    print("\n✅ Static site generation complete!")

if __name__ == '__main__':
    main()
