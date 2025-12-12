import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

# --- 1. ПОДКЛЮЧЕНИЕ ---
print("--- ПОДКЛЮЧЕНИЕ К FIREBASE ---")
try:
    cred = None
    if os.environ.get('FIREBASE_SERVICE_ACCOUNT'):
        service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
        cred = credentials.Certificate(service_account_info)
    elif os.path.exists('serviceAccountKey.json'):
        cred = credentials.Certificate('serviceAccountKey.json')
    else:
        print("Нет ключей!")
        exit(1)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"Ошибка: {e}")
    exit(1)

# --- 2. ВЫВОД СПИСКА ВСЕХ УСЛУГ ---
print("\n--- СПИСОК ДОКУМЕНТОВ В КОЛЛЕКЦИИ 'services' ---")
print(f"{'ID ДОКУМЕНТА (Имя в базе)':<40} | {'URL SLUG (Адрес сайта)':<30}")
print("-" * 80)

try:
    docs = db.collection('services').stream()
    found_any = False
    
    for doc in docs:
        found_any = True
        data = doc.to_dict()
        doc_id = doc.id
        url_slug = data.get('urlSlug', '--- НЕТ URL ---')
        
        print(f"{doc_id:<40} | {url_slug:<30}")
        
        # Если это наша страница (судя по URL), покажем её Schema
        if url_slug == 'razrabotka-saitov-tbilisi' or doc_id == 'razrabotka-saitov-tbilisi':
            print(f"\n>>> НАШЕЛ НУЖНУЮ СТРАНИЦУ! ID: {doc_id}")
            schema = data.get('schemaJsonLd', 'ПУСТО')
            print(f">>> Schema внутри: {str(schema)[:100]}...\n")

    if not found_any:
        print("Коллекция пуста!")

except Exception as e:
    print(f"Ошибка чтения: {e}")

print("-" * 80)
