import os
import re

# Папка, где лежит сгенерированный сайт
PUBLIC_DIR = 'public'

def audit_files():
    print("\n" + "="*60)
    print("ЗАПУСК АУДИТА ССЫЛОК (ПОИСК ОТСУТСТВУЮЩИХ СЛЭШЕЙ)")
    print("="*60)
    
    errors_found = 0
    
    # 1. Регулярка ищет href="ссылка" или href='ссылка'
    # Мы ищем все, что похоже на ссылку
    link_pattern = re.compile(r'href=["\'](.*?)["\']')
    
    # 2. Проходим по всем файлам в папке public
    for root, _, files in os.walk(PUBLIC_DIR):
        for file in files:
            # Проверяем HTML и JS файлы (в JS тоже могут быть жестко прописанные ссылки)
            if not (file.endswith(".html") or file.endswith(".js")):
                continue

            file_path = os.path.join(root, file)
            
            with open(file_path, 'r', encoding='utf-8') as f:
                try:
                    content = f.read()
                except UnicodeDecodeError:
                    continue # Пропускаем бинарные файлы если попадутся

            # Находим все ссылки в файле
            links = link_pattern.findall(content)

            for link in links:
                # --- ФИЛЬТРЫ (ЧТО МЫ ИГНОРИРУЕМ) ---
                
                # Игнорируем внешние ссылки (google.com и т.д.), кроме нашего домена
                if link.startswith('http') and 'digital-craft-tbilisi.site' not in link:
                    continue
                
                # Игнорируем якоря (#), пустые ссылки, корень (/) и вызовы js/tel/mailto
                if link in ['/', '#'] or link.startswith('#') or link.startswith('javascript:') or link.startswith('tel:') or link.startswith('mailto:'):
                    continue
                
                # Игнорируем ссылки на файлы (css, js, png, xml, json, svg, ico, webmanifest)
                # Если в ссылке есть точка, и это не наш домен - скорее всего это файл
                filename = link.split('/')[-1]
                if '.' in filename and 'digital-craft-tbilisi.site' not in filename:
                    continue

                # --- ПРОВЕРКА (СУТЬ ПРОБЛЕМЫ) ---
                
                # Если ссылка НЕ заканчивается на слэш
                if not link.endswith('/'):
                    
                    # Формируем красивый путь к файлу для лога (обрезаем public/)
                    relative_path = os.path.relpath(file_path, PUBLIC_DIR)
                    
                    print(f"\n[!] НАЙДЕНА ПРОБЛЕМА в файле: {relative_path}")
                    print(f"    Плохая ссылка:  {link}")
                    print(f"    Как исправить:  Добавить '/' в конце")
                    
                    # Пытаемся найти контекст (кусок текста рядом со ссылкой), чтобы вам было легче найти её в базе
                    start_index = content.find(link)
                    if start_index != -1:
                        context_start = max(0, start_index - 50)
                        context_end = min(len(content), start_index + len(link) + 50)
                        context = content[context_start:context_end].replace('\n', ' ')
                        print(f"    КОНТЕКСТ: ...{html_escape_reverse(context)}...")
                    
                    errors_found += 1

    if errors_found == 0:
        print("\n" + "="*60)
        print("✅ ОТЛИЧНО! Ссылок без слэша не найдено.")
        print("Если Sitechecker их все еще видит, возможно, это старый кэш краулера.")
        print("="*60)
    else:
        print("\n" + "="*60)
        print(f"❌ ВСЕГО НАЙДЕНО ОШИБОК: {errors_found}")
        print("="*60)
        # Генерируем ошибку, чтобы GitHub Action пометил билд красным (опционально)
        # exit(1) 

def html_escape_reverse(s):
    """Упрощаем чтение HTML в консоли"""
    return s.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')

if __name__ == "__main__":
    if not os.path.exists(PUBLIC_DIR):
        print(f"ОШИБКА: Папка {PUBLIC_DIR} не найдена. Сначала запустите генерацию сайта.")
    else:
        audit_files()
