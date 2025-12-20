import os
import json
import shutil
import firebase_admin
from firebase_admin import credentials, firestore
from jinja2 import Environment, FileSystemLoader
from datetime import datetime
import re

# --- НАСТРОЙКИ ---
BASE_URL = "https://digital-craft-tbilisi.site"
OUTPUT_DIR = 'public'

# Инициализация Firebase
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

# --- ЛОГИКА ОБРАБОТКИ КОНТЕНТА (Медиа) ---

def format_content(content_string):
    """Превращает текст из Firebase в HTML: ссылки на фото в <img>, ссылки на YT в <iframe>"""
    if not content_string:
        return ""
    
    # Регулярные выражения
    youtube_regex = r'^https?://(?:www\.|m\.)?(?:youtu\.be/|youtube\.com/(?:embed/|v/|watch\?v=|watch\?.*&v=|shorts/))([a-zA-Z0-9_-]{11}).*$'
    image_regex = r'^https?://[^<>" \']+\.(?:jpg|jpeg|png|gif|webp|svg)$'

    blocks = str(content_string).split('\n\n')
    processed_blocks = []

    for block in blocks:
        trimmed = block.strip()
        
        # Проверка на YouTube
        yt_match = re.match(youtube_regex, trimmed)
        # Проверка на Картинку
        img_match = re.match(image_regex, trimmed, re.IGNORECASE)

        if yt_match:
            video_id = yt_match.group(1)
            processed_blocks.append(f'<div class="embedded-video" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.5em 0;border-radius:4px;border:1px solid var(--color-border);"><iframe style="position:absolute;top:0;left:0;width:100%;height:100%;" src="https://www.youtube.com/embed/{video_id}" frameborder="0" allowfullscreen></iframe></div>')
        elif img_match:
            processed_blocks.append(f'<p style="margin:1.5em 0;"><img src="{trimmed}" alt="Content image" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:4px;border:1px solid var(--color-border);" /></p>')
        else:
            # Обычный текст
            text_with_br = trimmed.replace('\n', '<br>')
            processed_blocks.append(f'<p>{text_with_br}</p>')

    return "".join(processed_blocks)

# --- СБОР ДАННЫХ ---

def get_all_data():
    site_data = {}
    try:
        # Контент для главной
        home_doc = db.collection('home').document('content').get()
        site_data['home'] = home_doc.to_dict() if home_doc.exists else {}

        # Контент из коллекций
        collections = ['services', 'portfolio', 'blog', 'contact']
        for col in collections:
            docs = db.collection(col).stream()
            site_data[col] = []
            for doc in docs:
                data = doc.to_dict()
                data['collection_name'] = col
                # Парсим JSON-LD если он строка
                if 'schemaJsonLd' in data and isinstance(data['schemaJsonLd'], str):
                    try: data['schemaJsonLd'] = json.loads(data['schemaJsonLd'])
                    except: pass
                site_data[col].append(data)
        return site_data
    except Exception as e:
        print(f"❌ Data fetch error: {e}")
        return None

# --- ГЕНЕРАЦИЯ ---

def generate_static_file(item, all_data, template_name, is_home=False):
    lang = item.get('lang', 'en')
    col = item.get('collection_name', 'home')
    slug = item.get('urlSlug', '')

    if is_home:
        # Путь для главной: /index.html или /{lang}/index.html
        sub_path = '' if lang == 'en' else lang
    else:
        # Путь для внутренних: /{lang}/{col}/{slug}/index.html
        sub_path = os.path.join(lang, col, slug)

    target_dir = os.path.join(OUTPUT_DIR, sub_path)
    os.makedirs(target_dir, exist_ok=True)
    file_path = os.path.join(target_dir, 'index.html')

    try:
        tmpl = env.get_template(template_name)
        html = tmpl.render(
            item=item,
            site_data=all_data,
            lang=lang,
            format_content=format_content, # Важно для детальных страниц
            now=datetime.now()
        )
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"  📄 Generated: {file_path}")
    except Exception as e:
        print(f"  ❌ Render error for {file_path}: {e}")

def generate_sitemap(all_data):
    now = datetime.now().strftime("%Y-%m-%d")
    urls = []

    # 1. Главные страницы
    for lang in ['en', 'ka', 'ru', 'ua']:
        loc = f"{BASE_URL}/" if lang == 'en' else f"{BASE_URL}/{lang}/"
        urls.append(f"    <url><loc>{loc}</loc><lastmod>{now}</lastmod><priority>1.0</priority></url>")

    # 2. Все внутренние документы
    priorities = {'services': '0.9', 'portfolio': '0.8', 'blog': '0.7', 'contact': '0.5'}
    for col, prio in priorities.items():
        for item in all_data.get(col, []):
            lang = item.get('lang', 'en')
            slug = item.get('urlSlug')
            if slug:
                loc = f"{BASE_URL}/{lang}/{col}/{slug}/"
                urls.append(f"    <url><loc>{loc}</loc><lastmod>{now}</lastmod><priority>{prio}</priority></url>")

    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{os.linesep.join(urls)}</urlset>'
    with open(os.path.join(OUTPUT_DIR, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write(xml)
    print("✅ Sitemap.xml generated.")

def copy_assets():
    ignore = ['generate_site.py', 'template.html', 'index.html', 'public', '.git', '.github', 'firebase.json']
    for item in os.listdir('.'):
        if item not in ignore and not item.startswith('.'):
            s, d = os.path.join('.', item), os.path.join(OUTPUT_DIR, item)
            if os.path.isdir(s): shutil.copytree(s, d, dirs_exist_ok=True)
            else: shutil.copy2(s, d)
    print("📂 Assets copied.")

def main():
    if os.path.exists(OUTPUT_DIR): shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR)

    all_data = get_all_data()
    if not all_data: return

    # Главная (делаем одну для теста, если в базе только один док home/content)
    # Если в базе будет массив для разных языков — тут нужен цикл
    home_item = all_data.get('home', {})
    generate_static_file(home_item, all_data, 'index.html', is_home=True)

    # Внутренние
    for col in ['services', 'portfolio', 'blog', 'contact']:
        for item in all_data.get(col, []):
            generate_static_file(item, all_data, 'template.html')

    copy_assets()
    generate_sitemap(all_data)
    print("\n🚀 All tasks completed!")

if __name__ == '__main__':
    main()
