// Файл: netlify/edge-functions/prerender.js
// Финальная версия с проверкой внутри JS

const BOT_USER_AGENTS = [
  'googlebot', 'bingbot', 'yandex', 'facebookexternalhit', 'twitterbot',
  'linkedinbot', 'w3c_validator', 'schema.org', 'telegrambot'
];

export default async (request) => {
  const url = new URL(request.url);

  // --- ГЛАВНОЕ ИСПРАВЛЕНИЕ ---
  // Если это запрос к robots.txt, ничего не делать и позволить Netlify отдать файл.
  // `context.next()` - это самый правильный способ передать управление дальше.
  if (url.pathname === '/robots.txt') {
    return;
  }
  
  const userAgent = request.headers.get('user-agent')?.toLowerCase();

  // Пропускаем статические ресурсы
  if (/\.(css|js|svg|png|jpg|jpeg|gif|ico|webp|woff|woff2|json|xml)$/i.test(url.pathname)) {
    return;
  }

  // Проверяем, является ли запрос от бота
  const isBot = userAgent && BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
  
  if (!isBot) {
    return;
  }

  // --- Логика для бота ---
  try {
    const prerenderToken = Deno.env.get('PRERENDER_TOKEN');
    
    if (!prerenderToken) {
      return new Response("Prerender token not configured.", { status: 500 });
    }

    const prerenderUrl = `https://service.prerender.io/${request.url}`;
    
    return await fetch(prerenderUrl, {
      headers: {
        'X-Prerender-Token': prerenderToken
      }
    });

  } catch (error) {
    return new Response(`Prerender function failed: ${error.message}`, { status: 500 });
  }
};