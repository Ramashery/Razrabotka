// Улучшенный и отладочный файл: netlify/edge-functions/prerender.js

const BOT_USER_AGENTS = [
  'googlebot', 'bingbot', 'yandex', 'facebookexternalhit', 'twitterbot',
  'linkedinbot', 'w3c_validator', 'telegrambot', 'semrushbot', 'ahrefsbot'
  // Добавьте других ботов по необходимости
];

export default async (request, context) => {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent')?.toLowerCase();
  
  // 1. Логируем каждый запрос, чтобы видеть, что они доходят
  console.log(`[+] Request received for: ${url.pathname}`);
  console.log(`  User-Agent: ${userAgent}`);

  // 2. Проверяем, не является ли это запросом на статический ресурс
  if (/\.(css|js|svg|png|jpg|jpeg|gif|ico|webp|woff|woff2|json|xml)$/i.test(url.pathname)) {
    console.log(`  -> Is a static asset. Skipping.`);
    return; // Пропускаем статику
  }

  // 3. Проверяем, бот ли это
  const isBot = userAgent && BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
  
  if (!isBot) {
    console.log(`  -> Is not a bot. Skipping.`);
    return; // Если не бот, пропускаем
  }

  console.log(`  -> Matched as a BOT. Proceeding to prerender.`);

  try {
    // 4. Пытаемся получить токен
    const prerenderToken = context.env.get('PRERENDER_TOKEN');
    if (!prerenderToken) {
      console.error(`  [!] ERROR: PRERENDER_TOKEN is not set in Netlify environment!`);
      // Возвращаем ошибку, чтобы было видно в браузере
      return new Response("Prerender token not configured on server.", { status: 500 });
    }
    console.log(`  -> Successfully retrieved PRERENDER_TOKEN.`);

    // 5. Формируем URL и делаем запрос к Prerender.io
    const prerenderUrl = `https://service.prerender.io/${request.url}`;
    console.log(`  -> Fetching from Prerender: ${prerenderUrl}`);

    const prerenderResponse = await fetch(prerenderUrl, {
      headers: {
        'X-Prerender-Token': prerenderToken
      }
    });

    console.log(`  -> Prerender responded with status: ${prerenderResponse.status}`);
    
    // 6. Возвращаем ответ от Prerender
    return prerenderResponse;

  } catch (error) {
    console.error(`  [!] CATCH BLOCK ERROR: An error occurred during prerender logic.`);
    console.error(error);
    return new Response(`Prerender function failed: ${error.message}`, { status: 500 });
  }
};

// Исправленный доступ к переменным окружения: context.env.get() вместо Deno.env.get()
// Это более современный и надежный способ в Netlify Edge Functions.