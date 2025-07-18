// prerender.js
import { launch } from 'puppeteer';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore'; // <--- ВОТ ЭТА СТРОКА ИСПРАВЛЕНА
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';

// --- НАСТРОЙКА FIREBASE ADMIN ---
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА: Секретный ключ FIREBASE_SERVICE_ACCOUNT не найден!");
    console.error("Добавьте его в переменные окружения на Netlify.");
    process.exit(1);
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
  console.log('Получаю список страниц из базы данных... v2'); // Это изменение для запуска новой сборки
  const routes = new Set(['/']);
  const collections = ['services', 'portfolio', 'blog', 'contact'];

  for (const collection of collections) {
    try {
      const snapshot = await db.collection(collection).get();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.urlSlug && data.lang) {
            const langPrefix = data.lang === 'en' ? '' : `/${data.lang}`;
            const finalRoute = `${langPrefix}/${collection}/${data.urlSlug}`;
            routes.add(finalRoute.replace(/\/+/g, '/'));
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
    console.log('Запускаю временный сервер Vite...');
    previewServer = exec('npm run preview');
    await new Promise(resolve => setTimeout(resolve, 8000));

    console.log('Запускаю виртуальный браузер (Puppeteer)...');
    const browser = await launch({
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
      executablePath: process.env.CHROMIUM_PATH || (process.platform === 'win32' ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome')
    });
    const page = await browser.newPage();
    
    const routes = await fetchRoutes();

    for (const route of routes) {
        const cleanRoute = route.startsWith('/') ? route.substring(1) : route;
        const url = `${baseUrl}/${cleanRoute}`;
        const filePath = path.join(outputDir, cleanRoute, 'index.html');
        
        console.log(`Обрабатываю: ${url}`);
        
        await page.goto(url, { 
            waitUntil: 'networkidle2', 
            timeout: 90000 
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const content = await page.content();
        
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, content);
    }

    await fs.copy(path.join(outputDir, 'index.html'), path.join(outputDir, '404.html'));
    console.log('Создан файл 404.html для корректной работы SPA.');

    await browser.close();
    console.log('Обработка успешно завершена!');

  } catch (error) {
    console.error('Произошла ошибка во время обработки:', error);
    process.exit(1);
  } finally {
    if (previewServer) {
        console.log('Выключаю временный сервер...');
        previewServer.kill();
    }
  }
}

runPrerender();