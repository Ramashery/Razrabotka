// Финальная версия: netlify/edge-functions/prerender.js

const BOT_USER_AGENTS = [
  'googlebot', 'bingbot', 'yandex', 'facebookexternalhit', 'twitterbot',
  'linkedinbot', 'w3c_validator', 'telegrambot', 'semrushbot', 'ahrefsbot',
  'mj12bot', 'dotbot'
];

export default async (request, context) => {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent')?.toLowerCase();

  // Пропускаем статические ресурсы
  if (/\.(css|js|svg|png|jpg|jpeg|gif|ico|webp|woff|woff2|json|xml)$/i.test(url.pathname)) {
    return;
  }

  // Проверяем, является ли запрос от бота
  const isBot = userAgent && BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
  
  if (!isBot) {
    return; // Если не бот, ничего не делаем
  }

  // --- Логика для бота ---
  try {
    // ИСПРАВЛЕНИЕ: Используем Deno.env.get() для доступа к переменным
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