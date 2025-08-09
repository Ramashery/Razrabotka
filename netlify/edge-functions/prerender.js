// Финальная версия v2: netlify/edge-functions/prerender.js
// Включает User-Agent'ы для валидаторов и соцсетей.

const BOT_USER_AGENTS = [
  // Основные поисковые роботы
  'googlebot',
  'bingbot',
  'yandex',
  'duckduckbot',
  'baiduspider',
  
  // Роботы социальных сетей и мессенджеров
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'pinterest',
  'whatsapp',
  'telegrambot',
  'discordbot',
  'slackbot',

  // Роботы валидаторов и SEO-инструментов
  'w3c_validator',
  'google-structured-data-testing-tool',
  'google-site-verification',
  'schema.org', // На всякий случай
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'dotbot',
  'petalbot'
];

export default async (request, context) => {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent')?.toLowerCase();

  // Пропускаем статические ресурсы, чтобы не тратить лимиты Prerender
  if (/\.(css|js|svg|png|jpg|jpeg|gif|ico|webp|woff|woff2|json|xml)$/i.test(url.pathname)) {
    return;
  }

  // Проверяем, является ли запрос от известного бота
  const isBot = userAgent && BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
  
  if (!isBot) {
    // Если это не бот, ничего не делаем и пропускаем запрос дальше
    return;
  }

  // --- Если это бот, запускаем логику Prerender ---
  try {
    // Получаем токен из переменных окружения Netlify
    const prerenderToken = Deno.env.get('PRERENDER_TOKEN');
    
    if (!prerenderToken) {
      console.error("[PRERENDER_ERROR] PRERENDER_TOKEN is not set in Netlify environment variables!");
      return new Response("Prerender token not configured on server.", { status: 500 });
    }

    // Формируем URL для запроса к Prerender.io
    const prerenderUrl = `https://service.prerender.io/${request.url}`;
    
    // Делаем запрос к Prerender и возвращаем его ответ
    return await fetch(prerenderUrl, {
      headers: {
        'X-Prerender-Token': prerenderToken
      }
    });

  } catch (error) {
    console.error("[PRERENDER_ERROR] An error occurred during prerender logic:", error);
    return new Response(`Prerender function failed: ${error.message}`, { status: 500 });
  }
};