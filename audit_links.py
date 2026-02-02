import os
import re

PUBLIC_DIR = 'public'

def audit_files():
    print("\n" + "="*60)
    print("ЗАПУСК УЛУЧШЕННОГО АУДИТА ССЫЛОК")
    print("="*60)
    
    errors_found = 0
    link_pattern = re.compile(r'href=["\'](.*?)["\']')
    
    for root, _, files in os.walk(PUBLIC_DIR):
        for file in files:
            # Проверяем только HTML, так как в JS много ложных срабатываний из-за переменных
            if not file.endswith(".html"):
                continue

            file_path = os.path.join(root, file)
            with open(file_path, 'r', encoding='utf-8') as f:
                try:
                    content = f.read()
                except UnicodeDecodeError:
                    continue

            links = link_pattern.findall(content)
            for link in links:
                # Пропускаем внешние ссылки, якоря, файлы и JS-переменные
                if (link.startswith('http') and 'digital-craft-tbilisi.site' not in link) or \
                   link in ['/', '#'] or link.startswith('#') or \
                   link.startswith('javascript:') or link.startswith('tel:') or \
                   link.startswith('mailto:') or link.startswith('${'): # Игнорируем ${itemUrl}
                    continue
                
                # Пропускаем ссылки на файлы (картинки, стили и т.д.)
                if '.' in link.split('/')[-1] and 'digital-craft-tbilisi.site' not in link:
                    continue

                # ПРОВЕРКА: Если нет слэша в конце
                if not link.endswith('/'):
                    relative_path = os.path.relpath(file_path, PUBLIC_DIR)
                    print(f"\n[!] ОШИБКА в файле: {relative_path}")
                    print(f"    Ссылка без слэша: {link}")
                    errors_found += 1

    if errors_found == 0:
        print("\n✅ Реальных ошибок в HTML не найдено!")
    else:
        print(f"\n❌ НАЙДЕНО РЕАЛЬНЫХ ОШИБОК: {errors_found}")

if __name__ == "__main__":
    audit_files()
