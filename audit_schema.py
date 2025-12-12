import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

# --- НАСТРОЙКИ ---
COLLECTIONS_TO_CHECK = ['services'] # Можно добавить 'blog', 'portfolio'

# --- ПОДКЛЮЧЕНИЕ ---
print("--- [1] ЗАПУСК АУДИТА SCHEMA.ORG ---")
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

# --- ЛОГИКА ПРОВЕРКИ ---
def check_schema(doc_id, url_slug, schema_raw):
    status = "✅ OK"
    errors = []
    
    # 1. Проверка на пустоту
    if not schema_raw:
        return "❌ ПУСТО", ["Поле schemaJsonLd пустое"]

    # 2. Попытка прочитать JSON
    data = None
    if isinstance(schema_raw, str):
        try:
            data = json.loads(schema_raw)
        except json.JSONDecodeError:
            return "❌ JSON ERROR", ["Синтаксическая ошибка (лишняя запятая или скобка)"]
    else:
        data = schema_raw # Если уже объект

    # 3. Проверка структуры (должен быть Список [...])
    if isinstance(data, dict):
        errors.append("⚠️ СТАРЫЙ ФОРМАТ: Используется объект {}, а нужен список []")
        # Превращаем в список для дальнейшей проверки
        data = [data]
    elif not isinstance(data, list):
        return "❌ ФОРМАТ", ["Непонятный формат данных"]

    # 4. Проверка содержимого
    has_service = False
    has_faq = False
    missing_fields = []

    for item in data:
        item_type = item.get('@type', '')
        
        # Проверка Услуги
        if 'Service' in item_type or 'LocalBusiness' in item_type:
            has_service = True
            if not item.get('name'):
                missing_fields.append("Service: нет 'name'")
            if not item.get('image'):
                missing_fields.append("Service: нет 'image'")
            
            # Проверка вложенного провайдера (если есть)
            provider = item.get('provider', {})
            if provider and isinstance(provider, dict):
                 if not provider.get('image'):
                     missing_fields.append("Provider: нет 'image'")

        # Проверка FAQ
        if 'FAQPage' in item_type:
            has_faq = True
            questions = item.get('mainEntity', [])
            if not questions:
                missing_fields.append("FAQ: нет вопросов")

    if not has_service:
        errors.append("❌ НЕТ УСЛУГИ: Отсутствует @type: Service")
    
    if not has_faq:
        errors.append("⚠️ НЕТ FAQ: Отсутствует @type: FAQPage")

    if missing_fields:
        errors.append(f"❌ ОШИБКИ ПОЛЕЙ: {', '.join(missing_fields)}")

    # Итоговый статус
    if any("❌" in e for e in errors):
        status = "❌ ОШИБКА"
    elif errors:
        status = "⚠️ ПРЕДУПРЕЖДЕНИЕ"

    return status, errors

# --- ЗАПУСК ПО КОЛЛЕКЦИЯМ ---
for col in COLLECTIONS_TO_CHECK:
    print(f"\n📂 КОЛЛЕКЦИЯ: {col.upper()}")
    print(f"{'URL SLUG':<35} | {'СТАТУС':<15} | {'КОММЕНТАРИИ'}")
    print("-" * 100)
    
    docs = db.collection(col).stream()
    for doc in docs:
        doc_data = doc.to_dict()
        slug = doc_data.get('urlSlug', doc.id)
        raw_schema = doc_data.get('schemaJsonLd')
        
        status, issues = check_schema(doc.id, slug, raw_schema)
        
        print(f"{slug:<35} | {status:<15} | {', '.join(issues)}")

print("\n--- АУДИТ ЗАВЕРШЕН ---")
