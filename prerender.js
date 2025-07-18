// prerender.js
import { launch } from 'puppeteer';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';

// --- НАСТРОЙКА FIREBASE ADMIN ---
// Проверяем, есть ли секретный ключ. Если нет - завершаем работу с ошибкой.
// Позже мы добавим этот ключ в переменные окружения на Netlify.
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА: Секретный ключ FIREBASE_SERVICE_ACCOUNT не найден!");
    console.error("Добавьте его в переменные окружения на Netlify.");
    process.exit(1); // Завершить выполнение скрипта с ошибкой
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const outputDir = 'dist';
const port = 4173; 
const baseUrl = `http://localhost:${port}`;

// Функция для получения всех URL сайта из Firestore
async function fetchRoutes() {
  console.log('Получаю список страниц из базы данных...');
  const routes = new Set(['/']); // Главная страница всегда есть
  const collections = ['services', 'portfolio', 'blog', 'contact'];

  for (const collection of collections) {
    try {
      const snapshot = await db.collection(collection).get();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.urlSlug && data.lang) {
            // Если язык английский, префикс не нужен. Для остальных - нужен.
            // Например, /ka/services/veb-gamushaveba
            const langPrefix = data.lang === 'en' ? '' : `/${data.lang}`;
            const finalRoute = `${langPrefix}/${collection}/${data.urlSlug}`;
            routes.add(finalRoute.replace(/\/+/g, '/')); // Заменяем двойные слеши на одинарные
        }
      });
    } catch (error) {
        console.error(`Ошибка при получении данных из коллекции ${collection}:`, error);
    }
  }
  console.log(`Найдено ${routes.size} уникальных страниц для обработки.`);
  return Array.from(routes);
}

// Основная функция, которая запускает весь процесс
async function runPrerender() {
  let previewServer;
  try {
    // 1. Запускаем временный сервер, чтобы "открыть" наш сайт
    console.log('Запускаю временный сервер Vite...');
    previewServer = exec('npm run preview');
    await new Promise(resolve => setTimeout(resolve, 8000)); // Ждем 8 секунд, чтобы сервер точно запустился

    // 2. Запускаем "виртуальный браузер"
    console.log('Запускаю виртуальный браузер (Puppeteer)...');
    const browser = await launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    const routes = await fetchRoutes();

    // 3. Проходим по всем страницам и "фотографируем" их
    for (const route of routes) {
        // Убираем возможный слеш в начале, чтобы path.join работал корректно
        const cleanRoute = route.startsWith('/') ? route.substring(1) : route;
        const url = `${baseUrl}/${cleanRoute}`;
        
        // Создаем правильный путь к файлу. 
        // для /about -> /dist/about/index.html
        const filePath = path.join(outputDir, cleanRoute, 'index.html');
        
        console.log(`Обрабатываю: ${url}`);
        
        await page.goto(url, { waitUntil: 'networkidle0' }); // Ждем, пока страница полностью загрузится
        await page.waitForSelector('main > section', { timeout: 15000 }); // Ждем появления контента, увеличил таймаут

        const content = await page.content(); // Копируем HTML-код готовой страницы
        
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, content); // Сохраняем "фотографию" в файл
    }

    // 4. Создаем копию главной страницы как 404.html. Это нужно для Netlify.
    await fs.copy(path.join(outputDir, 'index.html'), path.join(outputDir, '404.html'));
    console.log('Создан файл 404.html для корректной работы SPA.');

    await browser.close();
    console.log('Обработка успешно завершена!');

  } catch (error) {
    console.error('Произошла ошибка во время обработки:', error);
    process.exit(1); // Завершить выполнение скрипта с ошибкой
  } finally {
    // 5. В любом случае (успех или ошибка) выключаем временный сервер
    if (previewServer) {
        console.log('Выключаю временный сервер...');
        previewServer.kill();
    }
  }
}

runPrerender();