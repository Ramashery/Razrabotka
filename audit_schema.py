import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

# --- ТЕПЕРЬ ПРОВЕРЯЕМ ВСЕ РАЗДЕЛЫ ---
COLLECTIONS_TO_CHECK = ['services', 'blog', 'portfolio']

print("--- [1] ЗАПУСК ПОЛНОГО АУДИТА САЙТА ---")
try:
    cred = None
    if os.environ.get('FIREBASE_SERVICE_ACCOUNT'):
        service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
        cred = credentials.Certificate(service_account_info)
    elif os.path.exists('serviceAccountKey.json'):
        cred = credentials.Certificate('serviceAccountKey.json')
    else:
        print("❌ Нет ключей доступа!")
        exit(1)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"❌ Ошибка подключения: {e}")
    exit(1)

def check_schema(doc_id, url_slug, schema_raw, collection_name):
    status = "✅ OK"
    errors = []
    
    if not schema_raw:
        return "❌ ПУСТО", ["Поле schemaJsonLd пустое"]

    data = None
    if isinstance(schema_raw, str):
        try:
            data = json.loads(schema_raw)
        except json.JSONDecodeError:
            return "❌ JSON ERROR", ["Синтаксическая ошибка"]
    else:
        data = schema_raw

    # Проверка формата
    if isinstance(data, dict):
        # Для Блога и Портфолио одиночный объект - это НОРМАЛЬНО (там не обязателен FAQ)
        # Но для Услуг мы хотим список.
        if collection_name == 'services':
            errors.append("⚠️ СТАРЫЙ ФОРМАТ (Нужен список [])")
        data = [data]
    elif not isinstance(data, list):
        return "❌ ФОРМАТ", ["Непонятный формат данных"]

    has_service_or_article = False
    missing_fields = []

    for item in data:
        item_type = item.get('@type', '')
        
        # Проверяем основные типы
        if any(x in item_type for x in ['Service', 'Article', 'BlogPosting', 'CreativeWork', 'LocalBusiness']):
            has_service_or_article = True
            
            # Проверка обязательных полей для Google
            if not item.get('name') and not item.get('headline'):
                missing_fields.append("Нет 'name'/'headline'")
            if not item.get('image'):
                missing_fields.append("Нет 'image'")
                
            # Проверка автора/провайдера
            author = item.get('author') or item.get('provider')
            if author and isinstance(author, dict):
                 if not author.get('image'):
                     missing_fields.append("Author/Provider: нет 'image'")

    if not has_service_or_article:
        errors.append("❌ ТИП: Не найден Service или Article")

    if missing_fields:
        errors.append(f"❌ ОШИБКИ ПОЛЕЙ: {', '.join(missing_fields)}")

    if any("❌" in e for e in errors):
        status = "❌ ОШИБКА"
    elif errors:
        status = "⚠️ ВНИМАНИЕ"

    return status, errors

# --- ЗАПУСК ---
for col in COLLECTIONS_TO_CHECK:
    print(f"\n📂 КОЛЛЕКЦИЯ: {col.upper()}")
    print(f"{'URL SLUG':<35} | {'СТАТУС':<15} | {'КОММЕНТАРИИ'}")
    print("-" * 100)
    
    try:
        docs = db.collection(col).stream()
        for doc in docs:
            doc_data = doc.to_dict()
            slug = doc_data.get('urlSlug', doc.id)
            raw_schema = doc_data.get('schemaJsonLd')
            
            status, issues = check_schema(doc.id, slug, raw_schema, col)
            
            if status != "✅ OK": # Показываем только проблемные, чтобы не засорять
                print(f"{slug:<35} | {status:<15} | {', '.join(issues)}")
            else:
                 # Если хотите видеть и хорошие, раскомментируйте строку ниже
                 # print(f"{slug:<35} | {status:<15} | OK")
                 pass
                 
    except Exception as e:
        print(f"Ошибка чтения коллекции {col}: {e}")

print("\n--- АУДИТ ЗАВЕРШЕН ---")
