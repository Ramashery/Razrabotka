import os
import json
import shutil
import firebase_admin
from firebase_admin import credentials, firestore
from jinja2 import Environment, FileSystemLoader

# --- НАСТРОЙКА ---
print("=== DEBUG SSG START ===")

try:
    service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
    cred = credentials.Certificate(service_account_info)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("[OK] Подключение к Firebase успешно.")
except Exception as e:
    print(f"[FATAL] ОШИБКА ПОДКЛЮЧЕНИЯ к Firebase: {e}")
    raise SystemExit(1)

# Настройка шаблонизатора
try:
    env = Environment(loader=FileSystemLoader('.'))
    template = env.get_template('template.html')
    print("[OK] Шаблон template.html загружен.")
except Exception as e:
    print(f"[FATAL] Не удалось загрузить template.html: {e}")
    raise SystemExit(1)

# Папка для сгенерированных файлов
OUTPUT_DIR = 'public_debug'
if os.path.exists(OUTPUT_DIR):
    print(f"[INFO] Удаляю старую папку {OUTPUT_DIR}...")
    shutil.rmtree(OUTPUT_DIR)
os.makedirs(OUTPUT_DIR, exist_ok=True)
print(f"[OK] Создана чистая папка {OUTPUT_DIR}.
")


# --- ФУНКЦИИ ---

def get_all_data():
    print("=== ШАГ 1: Загрузка данных из Firestore ===")
    site_data = {}
    try:
        # home
        home_doc = db.collection('home').document('content').get()
        if home_doc.exists:
            site_data['home'] = home_doc.to_dict()
            print("[OK] Документ home/content загружен.")
        else:
            print("[WARN] Документ home/content не найден.")

        collections = ['services', 'portfolio', 'blog', 'contact']
        for col in collections:
            print(f"  -> Читаю коллекцию '{col}' ...")
            docs = db.collection(col).stream()
            site_data[col] = []
            count = 0
            for doc in docs:
                doc_data = doc.to_dict()
                doc_data['collection_name'] = col

                # schemaJsonLd в JSON
                if 'schemaJsonLd' in doc_data and doc_data['schemaJsonLd']:
                    schema_data = doc_data['schemaJsonLd']
                    if isinstance(schema_data, str):
                        try:
                            doc_data['schemaJsonLd'] = json.loads(schema_data)
                        except json.JSONDecodeError:
                            print(f"  [WARN] schemaJsonLd не JSON у документа {col}/{doc.id}")
                            doc_data['schemaJsonLd'] = None

                site_data[col].append(doc_data)
                count += 1
            print(f"     [OK] Коллекция '{col}': {count} документов.")

        print("=== Данные из Firestore успешно загружены ===
")
        return site_data
    except Exception as e:
        print(f"[FATAL] Критическая ОШИБКА при загрузке данных: {e}")
        return None


def format_content(content_string):
    if not content_string:
        return ""
    paragraphs = content_string.strip().split('

')
    html_paragraphs = ["<p>{}</p>".format(p.replace('
', '<br>')) for p in paragraphs]
    return "".join(html_paragraphs)


def generate_detail_page(item, all_data):
    collection_name = item.get('collection_name')
    lang = item.get('lang', 'en')
    slug = item.get('urlSlug')

    # DEBUG по конкретной странице
    is_target = (collection_name == 'services' and lang == 'en' and slug == 'custom-web-development-tbilisi')

    lang_prefix = f"{lang}/" if lang != 'en' else ''
    path = os.path.join(OUTPUT_DIR, lang_prefix, collection_name, slug, 'index.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)

    print(f"[PAGE] {collection_name} | lang={lang} | slug={slug}")
    print(f"       → Путь: {path}")

    try:
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

        print(f"[OK] Страница создана: {os.path.join(lang_prefix, collection_name, slug)}")

        if is_target:
            print(">>> [TARGET OK] custom-web-development-tbilisi успешно сгенерирована.
")

    except Exception as e:
        print(f"[ERROR] Ошибка рендера/записи для {collection_name} | {lang} | {slug}: {e}")
        if is_target:
            print(">>> [TARGET FAIL] Ошибка именно на custom-web-development-tbilisi.
")


def generate_home_and_copy_assets(all_data):
    print("=== ШАГ 2: Главная и ассеты ===")
    home_path = os.path.join(OUTPUT_DIR, 'index.html')
    try:
        with open('index.html', 'r', encoding='utf-8') as f:
            original_html = f.read()
        home_data = all_data.get('home', {})
        seo_html = original_html.replace(
            '<title>Web Development & SEO Services in Tbilisi, Georgia | Digital Craft</title>',
            f'<title>{home_data.get("seoTitle", "Digital Craft")}</title>'
        )
        with open(home_path, 'w', encoding='utf-8') as f:
            f.write(seo_html)
        print(f"[OK] Главная страница создана: {home_path}")
    except FileNotFoundError:
        print("[WARN] Исходный файл 'index.html' не найден. Главная страница не будет создана.")
    except Exception as e:
        print(f"[ERROR] Ошибка при создании главной страницы: {e}")

    print("
[ASSETS] Копирование ассетов...")
    for item_name in os.listdir('.'):
        if item_name not in ['.git', '.github', OUTPUT_DIR,
                             'generate_site.py', 'generate_site_debug.py',
                             'template.html', 'index.html',
                             'firebase.json', 'README.md']:
            source_path = os.path.join('.', item_name)
            dest_path = os.path.join(OUTPUT_DIR, item_name)
            try:
                if os.path.isfile(source_path):
                    shutil.copy2(source_path, dest_path)
                elif os.path.isdir(source_path):
                    shutil.copytree(source_path, dest_path)
            except Exception as e:
                print(f"  [WARN] Не удалось скопировать {item_name}: {e}")
    print("[OK] Копирование ассетов завершено.
")


def main():
    all_data = get_all_data()
    if not all_data:
        print("[FATAL] Не удалось получить данные. Генерация сайта отменена.")
        return

    generate_home_and_copy_assets(all_data)

    print("=== ШАГ 3: Генерация detail-страниц (services, portfolio, blog) ===")
    collections_to_generate = ['services', 'portfolio', 'blog']
    for collection in collections_to_generate:
        items = all_data.get(collection, [])
        print(f"
[COLLECTION] {collection}: {len(items)} элементов.")
        for item in items:
            generate_detail_page(item, all_data)

    print("
=== DEBUG SSG FINISHED ===")


if __name__ == '__main__':
    main()