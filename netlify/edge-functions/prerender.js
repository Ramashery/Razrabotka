// Финальная версия v3: netlify/edge-functions/prerender.js
// Явно исключаем /robots.txt из обработки.

const BOT_USER_AGENTS = [
  'googlebot', 'bingbot', 'yandex', 'facebookexternalhit', 'twitterbot',
  'linkedinbot', 'w3c_validator', 'schema.org', 'telegrambot', 'semrushbot', 
  'ahrefsbot', 'mj12bot', 'dotbot'
];

export default async (request, context) => {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent')?.toLowerCase();

  // --- НОВОЕ ИСПРАВЛЕНИЕ ---
  // В самом начале проверяем, не запрос ли это к robots.txt.
  // Если да, то ничего не делаем и позволяем Netlify отдать статический файл.
  if (url.pathname === '/robots.txt') {
    return;
  }
  // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

  // Пропускаем статические ресурсы
  if (/\.(css|js|svg|png|jpg|jpeg|gif|ico|webp|woff|woff2|json|xml)$/i.test(url.pathname)) {
    return;
  }

  // Проверяем, является ли запрос от известного бота
  const isBot = userAgent && BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
  
  if (!isBot) {
    return;
  }

  // --- Логика для бота ---
  try {
    const prerenderToken = Deno.env.get('PRERENDER_TOKEN');
    
    if (!prerenderToken) {
      console.error("[PRERENDER_ERROR] PRERENDER_TOKEN is not set!");
      return new Response("Prerender token not configured on server.", { status: 500 });
    }

    const prerenderUrl = `https://service.prerender.io/${request.url}`;
    
    return await fetch(prerenderUrl, {
      headers: {
        'X-Prerender-Token': prerenderToken
      }
    });

  } catch (error) {
    console.error("[PRERENDER_ERROR] An error occurred:", error);
    return new Response(`Prerender function failed: ${error.message}`, { status: 500 });
  }
};