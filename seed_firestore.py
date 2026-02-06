# seed_firestore.py
import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# --- НАСТРОЙКА FIREBASE ---
try:
    if not firebase_admin._apps:
        # Предполагаем, что FIREBASE_SERVICE_ACCOUNT установлен как переменная окружения
        service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT'))
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✓ Подключение к Firebase успешно.")
except Exception as e:
    print(f"✗ ОШИКА ПОДКЛЮЧЕНИЯ к Firebase: {e}")
    exit(1)

# --- ДАННЫЕ ДЛЯ ИНИЦИАЛИЗАЦИИ ---
# Вы можете определить здесь начальные данные для ваших коллекций.
# Это пример для carouselItems.
initial_carousel_items = [
    {
        "id": "carousel-item-1", # Можно указать свой ID или позволить Firestore сгенерировать
        "lang": "en",
        "order": 0,
        "imageUrl": "https://picsum.photos/id/1015/1600/1000",
        "title": "Edge Visuals",
        "kicker": "Design systems that breathe",
        "description": "Build adaptive UI foundations with tokens, motion, and accessible color ramps. Ship faster without sameness.",
        "buttonText": "See case study",
        "buttonLink": "/en/portfolio/edge-visuals/",
        "status": "published",
        "lastModified": datetime.utcnow().isoformat() + "Z"
    },
    {
        "id": "carousel-item-2",
        "lang": "en",
        "order": 1,
        "imageUrl": "https://picsum.photos/id/1011/1600/1000",
        "title": "Realtime Dashboards",
        "kicker": "Signal over noise",
        "description": "Stream metrics, smooth spikes, and highlight deltas. Clarity first, chrome last.",
        "buttonText": "View live demo",
        "buttonLink": "/en/portfolio/realtime-dashboards/",
        "status": "published",
        "lastModified": datetime.utcnow().isoformat() + "Z"
    },
    # Добавьте другие элементы карусели для других языков или больше для английского
    {
        "id": "carousel-item-ka-1",
        "lang": "ka",
        "order": 0,
        "imageUrl": "https://picsum.photos/id/1016/1600/1000",
        "title": "ციფრული ხელობა",
        "kicker": "დიზაინის სისტემები, რომლებიც სუნთქავს",
        "description": "შექმენით ადაპტური UI საფუძვლები ტოკენებით, მოძრაობით და ხელმისაწვდომი ფერადი რამპებით. გაგზავნეთ უფრო სწრაფად ერთფეროვნების გარეშე.",
        "buttonText": "იხილეთ ქეისის კვლევა",
        "buttonLink": "/ka/portfolio/digital-craft/",
        "status": "published",
        "lastModified": datetime.utcnow().isoformat() + "Z"
    }
]

# Пример для домашней страницы (если она еще не существует)
initial_home_data = {
    "h1": "Digital Craft Tbilisi",
    "subtitle": "Professional websites for small businesses in Georgia.",
    "lang": "en",
    "seoTitle": "Digital Craft Tbilisi - Web Development & Design",
    "metaDescription": "We build modern, fast, and SEO-friendly websites for businesses in Tbilisi and beyond.",
    "ogTitle": "Digital Craft Tbilisi",
    "ogDescription": "Your partner for web development in Georgia.",
    "ogImage": "https://digital-craft-tbilisi.site/apple-touch-icon.png",
    "schemaJsonLd": json.dumps({
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Digital Craft Tbilisi",
        "url": "https://digital-craft-tbilisi.site",
        "logo": "https://digital-craft-tbilisi.site/favicon.svg",
        "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+995-555-123-456",
            "contactType": "Customer Service"
        }
    }),
    "backgroundHtml": "",
    "lastModified": datetime.utcnow().isoformat() + "Z"
}

def seed_collection(collection_ref, items_to_seed, check_field=None):
    """
    Заполняет коллекцию данными, если она пуста или если документ с check_field не существует.
    """
    print(f"\n--- Заполнение коллекции '{collection_ref.id}' ---")
    
    # Проверяем, существует ли уже какой-либо документ в коллекции
    # Если коллекция пуста, Firestore не вернет никаких документов
    existing_docs = collection_ref.limit(1).get()
    if existing_docs:
        print(f"Коллекция '{collection_ref.id}' уже содержит документы. Пропускаю полное заполнение.")
        # Если коллекция не пуста, но мы хотим добавить недостающие документы по ID
        for item_data in items_to_seed:
            doc_id = item_data.get('id')
            if doc_id:
                doc_ref = collection_ref.document(doc_id)
                if not doc_ref.get().exists:
                    doc_ref.set(item_data)
                    print(f"  ✓ Добавлен недостающий документ: {doc_id}")
                else:
                    print(f"  - Документ {doc_id} уже существует. Пропускаю.")
            else:
                print(f"  ! Пропущен элемент без 'id' в seed_collection для {collection_ref.id}.")
        return

    # Если коллекция пуста, добавляем все элементы
    for item_data in items_to_seed:
        doc_id = item_data.get('id')
        if doc_id:
            collection_ref.document(doc_id).set(item_data)
            print(f"  ✓ Добавлен документ: {doc_id}")
        else:
            # Если ID не указан, Firestore сгенерирует его
            new_doc_ref = collection_ref.add(item_data)
            print(f"  ✓ Добавлен документ с авто-ID: {new_doc_ref.id}")

    print(f"--- Заполнение коллекции '{collection_ref.id}' завершено. ---")


def seed_document(collection_name, document_id, data_to_seed):
    """
    Заполняет конкретный документ, если он не существует.
    """
    print(f"\n--- Заполнение документа '{collection_name}/{document_id}' ---")
    doc_ref = db.collection(collection_name).document(document_id)
    if not doc_ref.get().exists:
        doc_ref.set(data_to_seed)
        print(f"✓ Документ '{collection_name}/{document_id}' создан.")
    else:
        print(f"- Документ '{collection_name}/{document_id}' уже существует. Пропускаю.")
    print(f"--- Заполнение документа '{collection_name}/{document_id}' завершено. ---")


if __name__ == '__main__':
    print("Начинаю инициализацию Firestore...")

    # Инициализация домашней страницы
    seed_document('home', 'content', initial_home_data)

    # Инициализация коллекции carouselItems
    seed_collection(db.collection('carouselItems'), initial_carousel_items)

    # Здесь вы можете добавить инициализацию для других коллекций, например:
    # initial_services = [...]
    # seed_collection(db.collection('services'), initial_services)

    print("\nИнициализация Firestore завершена.")