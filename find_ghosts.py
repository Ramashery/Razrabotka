import os
import re

# Укажите здесь часть ссылки, на которую ругается Sitechecker (без слэша)
TARGET_LINK_PART = "seo-optimization-tbilisi" 

def search_in_files():
    print(f"Ищу ссылки, содержащие '{TARGET_LINK_PART}' но БЕЗ слэша на конце, в папке public...")
    
    # Регулярка: ищет href="...target" (где после target НЕТ слэша)
    # [^"'>]* означает любые символы ссылки до искомой части
    # (?!"|'|/|\\) означает "после этого нет кавычки или слэша" - это сложнее,
    # проще найти все вхождения и проверить конец.
    
    count = 0
    for root, dirs, files in os.walk("public"):
        for file in files:
            if file.endswith(".html"):
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    
                # Ищем все ссылки href="..."
                links = re.findall(r'href=["\']([^"\']+)["\']', content)
                
                for link in links:
                    if TARGET_LINK_PART in link:
                        if not link.endswith('/'):
                            print(f"\n[НАЙДЕНО!] Файл: {path}")
                            print(f"Ссылка: {link}")
                            count += 1

    if count == 0:
        print("\nСсылки без слэша в статическом HTML не найдены. Значит, их генерирует JavaScript (main.js)!")
    else:
        print(f"\nВсего найдено 'битых' ссылок: {count}")

if __name__ == "__main__":
    search_in_files()
