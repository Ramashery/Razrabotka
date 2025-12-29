import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

print("--- ЗАПУСК ДИАГНОСТИЧЕСКОГО СКРИПТА SITEMAP ---")
print("Цель: Проверить подключение к Firebase и наличие необходимых полей для sitemap.")

# --- ТЕСТ 1: ПОДКЛЮЧЕНИЕ К FIREBASE И ПРОВЕРКА УЧЕТНЫХ ДАННЫХ ---
print("\n--- ТЕСТ 1: Попытка подключения к Firebase... ---")
db = None
try:
    if not firebase_admin._apps:
        # Проверяем, существует ли переменная окружения
        service_account_json_str = os.environ.get('FIREBASE_SERVICE_ACCOUNT')
        if not service_account_json_str:
            raise ValueError("Переменная окружения 'FIREBASE_SERVICE_ACCOUNT' не найдена или пуста!")
        
        # Проверяем, является ли содержимое переменной валидным JSON
        service_account_info = json.loads(service_account_json_str)
        
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
    
    db = firestore.client()
    print("✓ УСПЕХ: Подключение к Firebase установлено.")
except Exception as e:
    print(f"❌ КРИТИЧЕСКАЯ ОШИБКА: Не удалось подключиться к Firebase.")
    print(f"   Причина: {e}")
    print("   ПРОВЕРЬТЕ: Правильно ли установлена переменная окружения 'FIREBASE_SERVICE_ACCOUNT' и валиден ли JSON-ключ.")
    exit(1)


# --- ТЕСТ 2: ПОЛУЧЕНИЕ И АНАЛИЗ ДАННЫХ ИЗ КОЛЛЕКЦИЙ ---
print("\n--- ТЕСТ 2: Получение данных и проверка полей sitemap... ---")
collections_to_check = ['services', 'portfolio', 'blog', 'contact']
all_pages_for_sitemap = []
found_any_data = False

for collection in collections_to_check:
    print(f"\n--- Коллекция: '{collection}' ---")
    try:
        docs = db.collection(collection).stream()
        docs_list = list(docs) # Преобразуем генератор в список, чтобы проверить его длину
        
        if not docs_list:
            print("  -> В коллекции не найдено ни одного документа.")
            continue

        print(f"  -> Найдено документов: {len(docs_list)}")
        found_any_data = True

        for doc in docs_list:
            doc_data = doc.to_dict()
            doc_data['id'] = doc.id
            doc_data['collection_name'] = collection
            
            # Собираем данные для вывода, используя .get() для безопасности
            doc_id = doc.id
            title = doc_data.get('title', '!!! Заголовок не найден !!!')
            lang = doc_data.get('lang', '!!! Язык не найден !!!')
            slug = doc_data.get('urlSlug', '!!! urlSlug не найден !!!')
            
            # --- Самая важная часть: проверка полей sitemap ---
            group_key = doc_data.get('translationGroupKey', '!!! НЕ НАЙДЕН !!!')
            priority = doc_data.get('sitemapPriority', '!!! НЕ НАЙДЕН !!!')
            changefreq = doc_data.get('sitemapChangefreq', '!!! НЕ НАЙДЕН !!!')
            last_mod = doc_data.get('lastModified', '!!! НЕ НАЙДЕН !!!')
            
            print(f"  - ID: {doc_id} | Title: '{title}'")
            print(f"    - lang: '{lang}'")
            print(f"    - urlSlug: '{slug}'")
            print(f"    - translationGroupKey: '{group_key}'")
            print(f"    - sitemapPriority: '{priority}'")
            print(f"    - sitemapChangefreq: '{changefreq}'")
            print(f"    - lastModified: '{last_mod}'")
            print("-" * 20)
            
            if lang != '!!! Язык не найден !!!' and slug != '!!! urlSlug не найден !!!':
                all_pages_for_sitemap.append(doc_data)

    except Exception as e:
        print(f"  ❌ ОШИБКА при чтении коллекции '{collection}': {e}")

if not found_any_data:
     print("\n❌ КРИТИЧЕСКАЯ ОШИБКА: Не удалось получить данные ни из одной коллекции. Проверьте права доступа вашего сервисного аккаунта в Firebase IAM.")


# --- ТЕСТ 3: ПРОВЕРКА ЛОГИКИ ГРУППИРОВКИ ---
print("\n--- ТЕСТ 3: Проверка логики группировки по 'translationGroupKey'... ---")
grouped = {}
loners = [] # Страницы без ключа

for page in all_pages_for_sitemap:
    key = page.get('translationGroupKey')
    if key:
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(page)
    else:
        loners.append(page)

if not grouped and not loners:
    print("  -> Нет данных для группировки.")
else:
    print(f"  -> Найдено {len(grouped)} уникальных групп переводов.")
    for key, pages in grouped.items():
        page_titles = [f"'{p.get('title')}' ({p.get('lang')})" for p in pages]
        print(f"    - Группа '{key}': {', '.join(page_titles)}")
    
    print(f"\n  -> Найдено {len(loners)} страниц без группы (будут обработаны индивидуально).")
    for page in loners:
        print(f"    - Одиночная страница: '{page.get('title')}' ({page.get('lang')})")


# --- ТЕСТ 4: ПРОВЕРКА ГЕНЕРАЦИИ URL ---
print("\n--- ТЕСТ 4: Проверка функции build_url_for_sitemap... ---")
BASE_URL = "https://digital-craft-tbilisi.site"

def build_url_for_sitemap(page):
    lang_prefix = f"/{page['lang']}"
    slug = page.get('urlSlug', '')
    if not slug.endswith('/'):
        slug += '/'
    return f"{BASE_URL}{lang_prefix}/{page['collection_name']}/{slug}"

if not all_pages_for_sitemap:
    print("  -> Нет данных для генерации URL.")
else:
    print("  -> Пример сгенерированных URL (до 5 штук):")
    for i, page in enumerate(all_pages_for_sitemap[:5]):
        url = build_url_for_sitemap(page)
        print(f"    - Исходные данные: lang='{page.get('lang')}', collection='{page.get('collection_name')}', slug='{page.get('urlSlug')}'")
        print(f"    - Результат: {url}\n")


print("\n--- ДИАГНОСТИКА ЗАВЕРШЕНА ---")
print("Что искать в результатах:")
print("1. Любые сообщения об ошибках (❌).")
print("2. Сообщения '!!! НЕ НАЙДЕН !!!'. Если вы их видите, значит, скрипт не получает эти поля из Firebase для конкретного документа.")
print("3. Проверьте, правильно ли страницы сгруппированы в Тесте 3.")
print("4. Убедитесь, что URL в Тесте 4 выглядят так, как вы ожидаете.")
