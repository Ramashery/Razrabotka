import os
import json
import shutil
import firebase_admin
from firebase_admin import credentials, firestore
from jinja2 import Environment, FileSystemLoader

# --- НАСТРОЙКА ---
try:
    # ИСПРАВЛЕННАЯ СТРОКА: Имя переменной теперь совпадает с deploy.yml
    service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
    cred = credentials.Certificate(service_account_info)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Подключение к Firebase успешно.")
except Exception as e:
    print(f"Ошибка подключения к Firebase: {e}")
    exit(1)

# Настройка шаблонизатора Jinja2
env = Environment(loader=FileSystemLoader('.'))
template = env.get_template('template.html')

# Папка для сгенерированных файлов
OUTPUT_DIR = 'public'
if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)
os.makedirs(OUTPUT_DIR, exist_ok=True)


# --- ФУНКЦИИ ---

def get_all_data():
    """Получает все данные из Firestore."""
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
                doc_data['collection_name'] = col 
                site_data[col].append(doc_data)
        
        print("Все данные из Firestore успешно загружены.")
        return site_data
    except Exception as e:
        print(f"Ошибка при загрузке данных: {e}")
        return None

def format_content(content_string):
    """Преобразует текст с переносами строк в HTML-параграфы."""
    if not content_string:
        return ""
    paragraphs = content_string.strip().split('\n\n')
    html_paragraphs = ["<p>{}</p>".format(p.replace('\n', '<br>')) for p in paragraphs]
    return "".join(html_paragraphs)


def generate_detail_page(item, all_data):
    """Генерирует HTML для детальной страницы."""
    collection_name = item['collection_name']
    lang_prefix = f"{item.get('lang', 'en')}/" if item.get('lang') != 'en' else ''
    slug = item['urlSlug']
    path = os.path.join(OUTPUT_DIR, lang_prefix, collection_name, slug, 'index.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)

    related_items = []
    pool = all_data.get('services', []) + all_data.get('blog', [])
    for related_item in pool:
        if len(related_items) >= 3: break
        if related_item.get('lang') == item.get('lang') and related_item.get('urlSlug') != item.get('urlSlug'):
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


def generate_home_and_copy_assets(all_data):
    """Генерирует главную страницу и копирует все остальные файлы."""
    # Шаг 1: Генерация главной страницы из вашего index (1).html
    home_path = os.path.join(OUTPUT_DIR, 'index.html')
    try:
        with open('index (1).html', 'r', encoding='utf-8') as f:
            original_html = f.read()
        home_data = all_data.get('home', {})
        seo_html = original_html.replace(
            '<title>Web Development & SEO Services in Tbilisi, Georgia | Digital Craft</title>', 
            f'<title>{home_data.get("seoTitle", "Digital Craft")}</title>'
        )
        
        with open(home_path, 'w', encoding='utf-8') as f:
            f.write(seo_html)
        print(f"✓ Создана главная страница (на основе index (1).html)")
    except FileNotFoundError:
        print("! ВНИМАНИЕ: Файл 'index (1).html' не найден. Главная страница не будет создана.")

    # Шаг 2: Копирование всех остальных нужных файлов и папок
    print("\nНачинаю копирование ассетов (стили, скрипты, картинки)...")
    for item_name in os.listdir('.'):
        if item_name not in ['.git', '.github', 'public', 'generate_site.py', 'template.html', 'index (1).html', 'firebase.json', 'README.md']:
            source_path = os.path.join('.', item_name)
            dest_path = os.path.join(OUTPUT_DIR, item_name)
            try:
                if os.path.isfile(source_path):
                    shutil.copy2(source_path, dest_path)
                    print(f"✓ Скопирован файл: {item_name}")
                elif os.path.isdir(source_path):
                    shutil.copytree(source_path, dest_path)
                    print(f"✓ Скопирована папка: {item_name}")
            except Exception as e:
                print(f"x Не удалось скопировать {item_name}: {e}")
    print("Копирование ассетов завершено.")


# --- ГЛАВНЫЙ СКРИПТ ---

def main():
    all_data = get_all_data()
    if not all_data:
        print("Не удалось получить данные. Генерация сайта отменена.")
        return

    generate_home_and_copy_assets(all_data)

    collections_to_generate = ['services', 'portfolio', 'blog']
    for collection in collections_to_generate:
        if collection in all_data:
            for item in all_data[collection]:
                generate_detail_page(item, all_data)
    
    print("\nГенерация сайта полностью завершена!")

if __name__ == '__main__':
    main()
