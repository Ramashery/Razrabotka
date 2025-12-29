#!/usr/bin/env python3
"""
Скрипт для отладки сгенерированного sitemap.xml
"""

import os
import sys
from datetime import datetime
from lxml import etree as ET

def main():
    print("=" * 60)
    print("ДЕБАГ SITEMAP.XML")
    print("=" * 60)
    
    output_path = 'public/sitemap.xml'
    
    # 1. Проверка существования файла
    print("\n1. ПРОВЕРКА ФАЙЛА:")
    print("-" * 40)
    
    if not os.path.exists(output_path):
        print(f"✗ ФАЙЛ НЕ НАЙДЕН: {output_path}")
        print("   Проверьте путь и выполните генерацию сайта.")
        return 1
    
    file_size = os.path.getsize(output_path)
    mod_time = datetime.fromtimestamp(os.path.getmtime(output_path)).strftime('%Y-%m-%d %H:%M:%S')
    
    print(f"✓ Файл найден: {output_path}")
    print(f"  Размер: {file_size} байт")
    print(f"  Время изменения: {mod_time}")
    
    # 2. Чтение содержимого
    print("\n2. СОДЕРЖИМОЕ ФАЙЛА:")
    print("-" * 40)
    
    try:
        with open(output_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        if file_size == 0:
            print("✗ ФАЙЛ ПУСТОЙ")
            return 1
            
        # Показываем начало и конец файла
        print(f"Первые 1000 символов:")
        print("=" * 60)
        print(content[:1000])
        print("=" * 60)
        
        print(f"\nПоследние 500 символов:")
        print("=" * 60)
        print(content[-500:] if len(content) > 500 else content)
        print("=" * 60)
        
    except Exception as e:
        print(f"✗ ОШИБКА ЧТЕНИЯ ФАЙЛА: {e}")
        return 1
    
    # 3. Проверка XML валидности
    print("\n3. ПРОВЕРКА XML:")
    print("-" * 40)
    
    try:
        tree = ET.parse(output_path)
        root = tree.getroot()
        
        print(f"✓ XML ВАЛИДЕН")
        print(f"  Корневой элемент: {root.tag}")
        print(f"  Атрибуты корня: {dict(root.attrib)}")
        print(f"  Всего элементов <url>: {len(root)}")
        
        # Проверяем namespace
        namespaces = dict(root.nsmap)
        print(f"  Namespaces: {namespaces}")
        
    except ET.XMLSyntaxError as e:
        print(f"✗ ОШИБКА СИНТАКСИСА XML:")
        print(f"  Строка {e.position[0]}, столбец {e.position[1]}")
        print(f"  Ошибка: {e.msg}")
        return 1
    except Exception as e:
        print(f"✗ ОШИБКА ПАРСИНГА XML: {e}")
        return 1
    
    # 4. Анализ структуры
    print("\n4. АНАЛИЗ СТРУКТУРЫ:")
    print("-" * 40)
    
    try:
        # Парсим снова для анализа
        tree = ET.parse(output_path)
        root = tree.getroot()
        
        # Собираем статистику
        url_count = 0
        hreflang_count = 0
        collections = {}
        languages = {}
        priorities = {}
        
        for url_elem in root:
            url_count += 1
            
            # Проверяем обязательные элементы
            loc = url_elem.find('loc')
            lastmod = url_elem.find('lastmod')
            changefreq = url_elem.find('changefreq')
            priority = url_elem.find('priority')
            
            # Считаем hreflang
            hreflang_links = url_elem.findall('.//{http://www.w3.org/1999/xhtml}link')
            hreflang_count += len(hreflang_links)
            
            # Анализируем URL
            if loc is not None and loc.text:
                url = loc.text
                
                # Определяем коллекцию
                parts = url.replace('https://digital-craft-tbilisi.site/', '').strip('/').split('/')
                if len(parts) >= 2:
                    collection = parts[1] if parts[0] in ['en', 'ka', 'ru', 'ua'] else 'home'
                    collections[collection] = collections.get(collection, 0) + 1
                
                # Определяем язык
                if url == 'https://digital-craft-tbilisi.site/':
                    lang = 'en'
                elif url.startswith('https://digital-craft-tbilisi.site/'):
                    lang = url.replace('https://digital-craft-tbilisi.site/', '').split('/')[0]
                else:
                    lang = 'unknown'
                languages[lang] = languages.get(lang, 0) + 1
            
            # Считаем приоритеты
            if priority is not None and priority.text:
                priorities[priority.text] = priorities.get(priority.text, 0) + 1
        
        print(f"Всего URL: {url_count}")
        print(f"Всего hreflang ссылок: {hreflang_count}")
        print(f"Среднее hreflang на URL: {hreflang_count/url_count:.1f}")
        
        print(f"\nРаспределение по коллекциям:")
        for col, count in sorted(collections.items()):
            print(f"  {col}: {count}")
            
        print(f"\nРаспределение по языкам:")
        for lang, count in sorted(languages.items()):
            print(f"  {lang}: {count}")
            
        print(f"\nРаспределение по приоритетам:")
        for prio, count in sorted(priorities.items()):
            print(f"  {prio}: {count}")
        
    except Exception as e:
        print(f"✗ ОШИБКА АНАЛИЗА: {e}")
        import traceback
        traceback.print_exc()
    
    # 5. Примеры записей
    print("\n5. ПРИМЕРЫ ЗАПИСЕЙ:")
    print("-" * 40)
    
    try:
        tree = ET.parse(output_path)
        root = tree.getroot()
        
        print("Пример 1 - Первая запись:")
        if len(root) > 0:
            first_url = root[0]
            print_element(first_url, indent=2)
        
        print("\nПример 2 - Запись с hreflang (если есть):")
        found_hreflang = False
        for i, url_elem in enumerate(root):
            hreflang_links = url_elem.findall('.//{http://www.w3.org/1999/xhtml}link')
            if hreflang_links:
                print(f"Найдена на позиции {i}:")
                print_element(url_elem, indent=2)
                found_hreflang = True
                break
        
        if not found_hreflang:
            print("Записи с hreflang не найдены")
        
        print("\nПример 3 - Последняя запись:")
        if len(root) > 0:
            last_url = root[-1]
            print_element(last_url, indent=2)
            
    except Exception as e:
        print(f"✗ ОШИБКА: {e}")
    
    # 6. Проверка групп (translationGroupKey)
    print("\n6. ПРОВЕРКА ГРУППИРОВКИ:")
    print("-" * 40)
    
    try:
        # Ищем записи с одинаковыми hreflang для проверки групп
        hreflang_groups = {}
        
        for i, url_elem in enumerate(root):
            hreflang_links = url_elem.findall('.//{http://www.w3.org/1999/xhtml}link')
            if hreflang_links:
                # Сортируем hreflang для создания ключа группы
                langs = sorted([link.get('hreflang') for link in hreflang_links])
                group_key = ','.join(langs)
                hreflang_groups.setdefault(group_key, []).append(i)
        
        if hreflang_groups:
            print(f"Найдено {len(hreflang_groups)} групп hreflang:")
            for group_key, indices in list(hreflang_groups.items())[:5]:  # Покажем первые 5
                print(f"  Группа {group_key}: {len(indices)} записей (индексы: {indices[:3]}...)")
        else:
            print("Группы hreflang не найдены")
            
    except Exception as e:
        print(f"✗ ОШИБКА: {e}")
    
    print("\n" + "=" * 60)
    print("ДЕБАГ ЗАВЕРШЕН")
    print("=" * 60)
    
    return 0

def print_element(elem, indent=0):
    """Рекурсивно печатает элемент XML."""
    spaces = ' ' * indent
    
    # Печатаем тег
    print(f"{spaces}<{elem.tag}>")
    
    # Печатаем текст, если есть
    if elem.text and elem.text.strip():
        print(f"{spaces}  Текст: {elem.text.strip()}")
    
    # Печатаем атрибуты
    if elem.attrib:
        for key, value in elem.attrib.items():
            print(f"{spaces}  Атрибут {key}: {value}")
    
    # Рекурсивно обрабатываем дочерние элементы
    for child in elem:
        print_element(child, indent + 2)
    
    # Закрывающий тег
    print(f"{spaces}</{elem.tag.split('}')[-1]}>")

if __name__ == '__main__':
    sys.exit(main())
