import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

# --- НАСТРОЙКА ПОДКЛЮЧЕНИЯ ---
print("--- [1] ПОДКЛЮЧЕНИЕ К FIREBASE ---")
try:
    # Пытаемся найти ключи доступа
    cred = None
    if os.environ.get('FIREBASE_SERVICE_ACCOUNT'):
        print("Использую ключи из переменных окружения...")
        service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
        cred = credentials.Certificate(service_account_info)
    elif os.path.exists('serviceAccountKey.json'):
        print("Использую файл serviceAccountKey.json...")
        cred = credentials.Certificate('serviceAccountKey.json')
    else:
        print("ОШИБКА: Не найдены ключи доступа (serviceAccountKey.json)!")
        exit(1)

    # Инициализация (проверка на повторную инициализацию)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    
    db = firestore.client()
    print("Успешно подключились к базе данных.")

except Exception as e:
    print(f"КРИТИЧЕСКАЯ ОШИБКА ПОДКЛЮЧЕНИЯ: {e}")
    exit(1)

# --- ПРОВЕРКА КОНКРЕТНОГО ДОКУМЕНТА ---
# Мы ищем страницу: services -> razrabotka-saitov-tbilisi
COLLECTION_NAME = 'services'
DOCUMENT_ID = 'razrabotka-saitov-tbilisi'

print(f"\n--- [2] ПРОВЕРКА ДОКУМЕНТА: {COLLECTION_NAME}/{DOCUMENT_ID} ---")

doc_ref = db.collection(COLLECTION_NAME).document(DOCUMENT_ID)
doc = doc_ref.get()

if not doc.exists:
    print(f"❌ ОШИБКА: Документ '{DOCUMENT_ID}' НЕ НАЙДЕН в коллекции '{COLLECTION_NAME}'!")
    print("Проверьте URL слаг в админке. Возможно, документ называется по-другому.")
else:
    print(f"✅ Документ найден.")
    data = doc.to_dict()
    
    # --- АНАЛИЗ ПОЛЯ SCHEMA ---
    print("\n--- [3] АНАЛИЗ ПОЛЯ schemaJsonLd ---")
    
    schema_raw = data.get('schemaJsonLd')
    
    if schema_raw is None:
        print("❌ ОШИБКА: Поле 'schemaJsonLd' ОТСУТСТВУЕТ или пустое!")
    else:
        print(f"Тип данных в поле: {type(schema_raw)}")
        
        # Если это строка, пробуем распарсить
        if isinstance(schema_raw, str):
            print("Данные сохранены как СТРОКА (это нормально).")
            # Проверяем наличие ключевых слов
            if "FAQPage" in schema_raw:
                print("✅ УСПЕХ: В коде найдено слово 'FAQPage'!")
            else:
                print("❌ ПРОБЛЕМА: В коде НЕТ слова 'FAQPage'. В базе лежат старые данные.")
            
            print("-" * 20)
            print("ВОТ ЧТО ЛЕЖИТ В БАЗЕ ПРЯМО СЕЙЧАС (первые 500 символов):")
            print(schema_raw[:500] + "...")
            print("-" * 20)
            
        # Если это уже JSON объект
        elif isinstance(schema_raw, (dict, list)):
            print("Данные сохранены как JSON ОБЪЕКТ.")
            schema_str = json.dumps(schema_raw)
            if "FAQPage" in schema_str:
                print("✅ УСПЕХ: В структуре найдено слово 'FAQPage'!")
            else:
                print("❌ ПРОБЛЕМА: В структуре НЕТ слова 'FAQPage'.")
            
            print("-" * 20)
            print(str(schema_raw)[:500] + "...")
            print("-" * 20)

print("\n--- ДИАГНОСТИКА ЗАВЕРШЕНА ---")
