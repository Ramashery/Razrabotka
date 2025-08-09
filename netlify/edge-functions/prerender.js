// Файл: netlify/edge-functions/prerender.js

// Список User-Agent'ов поисковых роботов и ботов соцсетей
const BOT_USER_AGENTS = [
  'googlebot',
  'yahoo! slurp',
  'bingbot',
  'yandex',
  'baiduspider',
  'facebookexternalhit',
  'twitterbot',
  'rogerbot',
  'linkedinbot',
  'embedly',
  'quora link preview',
  'showyoubot',
  'outbrain',
  'pinterest/0.',
  'pinterestbot',
  'developers.google.com/+/web/snippet',
  'slackbot',
  'vkshare',
  'w3c_validator',
  'redditbot',
  'applebot',
  'whatsapp',
  'flipboard',
  'tumblr',
  'bitlybot',
  'skypeuripreview',
  'nuzzel',
  'discordbot',
  'google page speed',
  'qwantify',
  'pinterest-rich-pins',
  'telegrambot',
  'semrushbot',
  'ahrefsbot',
  'mj12bot', // Добавим еще несколько популярных ботов
  'dotbot'
];

export default async (request, context) => {
  const userAgent = request.headers.get('user-agent')?.toLowerCase();

  // Дополнительная проверка: не пререндерить запросы на статические файлы (CSS, JS, изображения).
  // Это важно, чтобы избежать лишних запросов к Prerender.io.
  const url = new URL(request.url);
  if (/\.(css|js|svg|png|jpg|jpeg|gif|ico|webp|woff|woff2)$/i.test(url.pathname)) {
    // Если это статический файл, ничего не делаем, пропускаем запрос.
    return;
  }

  // Проверяем, является ли запрос от бота
  const isBot = userAgent && BOT_USER_AGENTS.some(bot => userAgent.includes(bot));

  if (isBot) {
    // Получаем токен из переменных окружения Netlify.
    // Deno.env - это способ доступа к переменным в Edge Functions.
    const prerenderToken = Deno.env.get('PRERENDER_TOKEN');
    
    if (!prerenderToken) {
      console.error("PRERENDER_TOKEN is not set in Netlify environment variables.");
      // Если токен не найден, возвращаем 500 ошибку с сообщением.
      return new Response("Prerender token not configured.", { status: 500 });
    }
    
    // Формируем URL для запроса к Prerender.io
    const urlToPrerender = request.url;
    const prerenderUrl = `https://service.prerender.io/${urlToPrerender}`;

    // Делаем запрос к Prerender.io, передавая наш токен в заголовках
    return fetch(prerenderUrl, {
      headers: {
        'X-Prerender-Token': prerenderToken
      }
    });
  }

  // Если это не бот и не статический файл, ничего не делаем и пропускаем запрос дальше.
};