import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
from jinja2 import Environment, FileSystemLoader

# --- НАСТРОЙКА ---
# Этот блок идеально подходит для GitHub Actions, он возьмет ключ из секрета
service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
cred = credentials.Certificate(service_account_info)

firebase_admin.initialize_app(cred)
db = firestore.client()

# Настройка шаблонизатора Jinja2 (он будет искать template.html в той же папке)
env = Environment(loader=FileSystemLoader('.'))
template = env.get_template('template.html')

# Папка для сгенерированных файлов. Firebase будет публиковать именно ее.
OUTPUT_DIR = 'public'
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Подключение к Firebase успешно.")

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
            # Сохраняем имя коллекции для будущих ссылок
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
    # Заменяем двойные переносы на теги <p>, а одинарные на <br>
    paragraphs = content_string.strip().split('\n\n')
    html_paragraphs = [f"<p>{p.replace('\n', '<br>')}</p>" for p in paragraphs]
    return "".join(html_paragraphs)


def generate_detail_page(item, all_data):
    """Генерирует HTML для детальной страницы."""
    collection_name = item['collection_name']
    lang_prefix = f"{item['lang']}/" if 'lang' in item and item['lang'] != 'en' else ''
    
    slug = item['urlSlug']
    # Создаем папку и index.html для "чистого" URL со слешем
    path = os.path.join(OUTPUT_DIR, lang_prefix, collection_name, slug, 'index.html')
    
    os.makedirs(os.path.dirname(path), exist_ok=True)

    # Ищем похожие посты (услуги и блог) на том же языке
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
        format_content=format_content # передаем функцию в шаблон
    )
    with open(path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"✓ Создана страница: {os.path.join(lang_prefix, collection_name, slug)}")


def generate_home_page(all_data):
    """Генерирует главную страницу."""
    path = os.path.join(OUTPUT_DIR, 'index.html')
    
    # Копируем ваш оригинальный index.html как основу для главной
    # Это сохранит все ваши скрипты и стили. JS потом подгрузит динамику.
    # Мы просто заменяем title и meta-теги.
    
    with open('index (1).html', 'r', encoding='utf-8') as f:
        original_html = f.read()

    # Простая замена SEO-тегов. Можно использовать более сложные парсеры, но для начала этого хватит.
    home_data = all_data['home']
    seo_html = original_html.replace(
        '<title>Web Development & SEO Services in Tbilisi, Georgia | Digital Craft</title>', 
        f'<title>{home_data.get("seoTitle", "Digital Craft")}</title>'
    ).replace(
        'content="Professional website development and SEO for small and medium businesses in Tbilisi. Get a fast, modern, and results-driven website. Contact us for a free consultation!"',
        f'content="{home_data.get("metaDescription", "")}"'
    )
    # ... можно добавить замены для Open Graph тегов по аналогии ...
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(seo_html)
    print(f"✓ Создана главная страница (на основе index.html)")
    
    # Копируем остальные важные файлы
    for file_name in ['styles.css', 'main.js', 'favicon.svg']:
         if os.path.exists(file_name):
            import shutil
            shutil.copy(file_name, os.path.join(OUTPUT_DIR, file_name))
            print(f"✓ Скопирован файл: {file_name}")

# --- ГЛАВНЫЙ СКРИПТ ---

def main():
    all_data = get_all_data()
    if not all_data:
        print("Не удалось получить данные. Генерация сайта отменена.")
        return

    # Генерация главной страницы и копирование ассетов
    if 'home' in all_data:
        generate_home_page(all_data)

    # Генерация детальных страниц
    collections_to_generate = ['services', 'portfolio', 'blog']
    for collection in collections_to_generate:
        if collection in all_data:
            for item in all_data[collection]:
                generate_detail_page(item, all_data)
    
    print("\nГенерация сайта завершена!")

if __name__ == '__main__':
    main()
