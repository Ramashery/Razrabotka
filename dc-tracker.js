/**
 * DC Analytics Tracker v3.1 — Digital Craft Tbilisi
 *
 * Новое в v3.1:
 *   - Трекинг следующей страницы (nextUrl) и страницы выхода (exitUrl)
 *   - Глубина просмотра пишется прямо в сессию при уходе
 *   - Активное время пишется в сессию (поле activeSeconds) при уходе
 *   - UTM-метки (utm_source, utm_medium, utm_campaign, utm_term, utm_content)
 *   - Referrer: полный URL + домен
 *   - IP-геолокация через Python-бэкенд
 *   - Клики по кнопкам, формам, телефонам, email, внешним ссылкам
 *   - Маркеры времени на странице (30с, 1мин, 3мин, 5мин)
 *   - Глубина скролла (25%, 50%, 75%, 90%)
 */
(function () {
  'use strict';

  var PROJECT_ID = 'razrabotka-b61bc';
  var API_KEY    = 'AIzaSyAT4dDEIDUtzP60ibjahO06P75Q6h95ZN4';
  var FS_BASE    = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/';

  // URL Python-бэкенда. После деплоя замени на реальный адрес.
  var GEO_ENDPOINT = 'https://razrabotka-2.onrender.com/geo';

  var SESSION_KEY   = 'dc_sess_v3';
  var RETURNING_KEY = 'dc_ret';
  var SESSION_TTL   = 30 * 60 * 1000; // 30 минут

  // ─── УТИЛИТЫ ───────────────────────────────────────────────────────────────
  function uid() {
    return 's' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function getBrowser(ua) {
    if (/Edg\//i.test(ua))     return 'Edge';
    if (/OPR|Opera/i.test(ua)) return 'Opera';
    if (/YaBrowser/i.test(ua)) return 'Yandex';
    if (/Chrome/i.test(ua))    return 'Chrome';
    if (/Firefox/i.test(ua))   return 'Firefox';
    if (/Safari/i.test(ua))    return 'Safari';
    return 'Other';
  }

  function getOS(ua) {
    if (/Windows/i.test(ua))     return 'Windows';
    if (/Mac OS/i.test(ua))      return 'macOS';
    if (/Android/i.test(ua))     return 'Android';
    if (/iPhone|iPad/i.test(ua)) return 'iOS';
    if (/Linux/i.test(ua))       return 'Linux';
    return 'Other';
  }

  function getDevice(ua) {
    if (/iPad|Tablet/i.test(ua))           return 'tablet';
    if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function getTZ() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'; }
    catch(e) { return 'unknown'; }
  }

  // ─── UTM ───────────────────────────────────────────────────────────────────
  function getUTM() {
    var params = new URLSearchParams(window.location.search);
    var utm = {
      utm_source:   params.get('utm_source')   || '',
      utm_medium:   params.get('utm_medium')   || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_term:     params.get('utm_term')     || '',
      utm_content:  params.get('utm_content')  || ''
    };
    if (utm.utm_source) {
      try { sessionStorage.setItem('dc_utm', JSON.stringify(utm)); } catch(e) {}
      return utm;
    }
    try {
      var saved = sessionStorage.getItem('dc_utm');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return utm;
  }

  function getRefDomain(ref) {
    if (!ref) return '';
    try { return new URL(ref).hostname; }
    catch(e) { return ''; }
  }

  function getSource(ref, utm) {
    if (utm.utm_source) return utm.utm_source;
    if (!ref) return 'direct';
    try {
      var h = new URL(ref).hostname;
      if (/google\.|yandex\.|bing\.|duckduckgo\./i.test(h)) return 'organic';
      if (/facebook|instagram|twitter|linkedin|vk\.|t\.me|tiktok/i.test(h)) return 'social';
      return 'referral';
    } catch(e) { return 'referral'; }
  }

  // ─── FIRESTORE ─────────────────────────────────────────────────────────────
  function toFields(data) {
    var fields = {};
    Object.keys(data).forEach(function(k) {
      var v = data[k];
      if (v === null || v === undefined || v === '') return;
      if (typeof v === 'boolean')     fields[k] = { booleanValue: v };
      else if (typeof v === 'number') fields[k] = { integerValue: String(Math.round(v)) };
      else                            fields[k] = { stringValue: String(v) };
    });
    return fields;
  }

  function fsPost(collection, data) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', FS_BASE + collection + '?key=' + API_KEY, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ fields: toFields(data) }));
    } catch(e) {}
  }

  /**
   * Обновляет поля в существующем документе сессии.
   * Используется при уходе пользователя — пишем exitUrl, depth, activeSeconds.
   * Принимает docName вида "analytics_sessions/DOC_ID".
   */
  function fsPatch(docName, data) {
    try {
      var fields = toFields(data);
      var fieldPaths = Object.keys(fields).join(',');
      if (!fieldPaths) return;
      var url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
                '/databases/(default)/documents/' + docName +
                '?key=' + API_KEY +
                '&updateMask.fieldPaths=' + encodeURIComponent(fieldPaths);
      var xhr = new XMLHttpRequest();
      xhr.open('PATCH', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ fields: fields }));
    } catch(e) {}
  }

  // ─── ГЕОЛОКАЦИЯ ────────────────────────────────────────────────────────────
  // Определяем гео через ip-api.com и пишем country/city/region ПРЯМО в документ
  // сессии analytics_sessions/{sessionId} — без отдельной коллекции analytics_geo.
  // Это экономит лимиты Firestore: 1 запрос на запись вместо 2.
  function fetchGeo(sessionId) {
    setTimeout(function() {
      // Сначала пробуем бэкенд (он знает реальный IP)
      if (GEO_ENDPOINT && GEO_ENDPOINT.indexOf('YOUR_BACKEND_URL') === -1) {
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', GEO_ENDPOINT + '?sid=' + encodeURIComponent(sessionId), true);
          xhr.timeout = 10000;
          xhr.onload = function() {
            if (xhr.status !== 200) fetchGeoFallback(sessionId);
          };
          xhr.onerror   = function() { fetchGeoFallback(sessionId); };
          xhr.ontimeout = function() { fetchGeoFallback(sessionId); };
          xhr.send();
        } catch(e) { fetchGeoFallback(sessionId); }
      } else {
        fetchGeoFallback(sessionId);
      }
    }, 2000);
  }

  // Fallback: ip-api.com напрямую из браузера (бесплатно, до 45 req/min)
  function fetchGeoFallback(sessionId) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'https://ip-api.com/json/?fields=status,country,regionName,city', true);
      xhr.timeout = 8000;
      xhr.onload = function() {
        if (xhr.status !== 200) return;
        try {
          var d = JSON.parse(xhr.responseText);
          if (!d || d.status === 'fail' || !d.country) return;
          // Пишем гео прямо в документ сессии — PATCH только новых полей
          patchSessionGeo(sessionId, d.country, d.city || '', d.regionName || '');
        } catch(e) {}
      };
      xhr.send();
    } catch(e) {}
  }

  // Дописывает country/city/region в уже существующий документ сессии
  function patchSessionGeo(sessionId, country, city, region) {
    try {
      var fields = toFields({ country: country, city: city, region: region });
      var fieldPaths = Object.keys(fields).map(encodeURIComponent).join('&updateMask.fieldPaths=');
      var url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
                '/databases/(default)/documents/analytics_sessions/' +
                encodeURIComponent(sessionId) +
                '?key=' + API_KEY +
                '&updateMask.fieldPaths=' + fieldPaths;
      var xhr = new XMLHttpRequest();
      xhr.open('PATCH', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ fields: fields }));
    } catch(e) {}
  }

  // ─── СЕССИЯ ────────────────────────────────────────────────────────────────
  var currentSession    = null;
  var currentSessionDoc = null; // имя документа Firestore (для PATCH при уходе)

  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (Date.now() - s.lastActivity < SESSION_TTL) {
          s.lastActivity = Date.now();
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
          currentSession = s;
          return s;
        }
      }
    } catch(e) {}

    var ua  = navigator.userAgent;
    var utm = getUTM();
    var ref = document.referrer || '';

    var session = {
      id:           uid(),
      ts:           Date.now(),
      lastActivity: Date.now(),
      src:          getSource(ref, utm),
      ref:          ref.slice(0, 300),
      refDomain:    getRefDomain(ref),
      utm_source:   utm.utm_source,
      utm_medium:   utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_term:     utm.utm_term,
      utm_content:  utm.utm_content,
      dev:          getDevice(ua),
      br:           getBrowser(ua),
      os:           getOS(ua),
      lang:         navigator.language || 'unknown',
      tz:           getTZ(),
      isNew:        !localStorage.getItem(RETURNING_KEY),
      startUrl:     window.location.pathname
    };

    try { localStorage.setItem(RETURNING_KEY, '1'); } catch(e) {}

    // Пишем сессию в Firestore через PATCH с известным ID (session.id).
    // Это позволяет позже дописать гео в тот же документ без отдельной коллекции.
    try {
      var sessDocUrl = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
                       '/databases/(default)/documents/analytics_sessions/' +
                       encodeURIComponent(session.id) + '?key=' + API_KEY;
      var sessXhr = new XMLHttpRequest();
      sessXhr.open('PATCH', sessDocUrl, true);
      sessXhr.setRequestHeader('Content-Type', 'application/json');
      sessXhr.send(JSON.stringify({ fields: toFields({
        id:           session.id,
        ts:           session.ts,
        src:          session.src,
        ref:          session.ref,
        refDomain:    session.refDomain,
        utm_source:   session.utm_source,
        utm_medium:   session.utm_medium,
        utm_campaign: session.utm_campaign,
        utm_term:     session.utm_term,
        utm_content:  session.utm_content,
        dev:          session.dev,
        br:           session.br,
        os:           session.os,
        lang:         session.lang,
        tz:           session.tz,
        isNew:        session.isNew,
        startUrl:     session.startUrl
      })}));
    } catch(e) {}

    fetchGeo(session.id);

    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch(e) {}
    currentSession = session;
    return session;
  }

  // ─── ПРОСМОТР СТРАНИЦЫ ─────────────────────────────────────────────────────
  // Храним историю страниц внутри сессии для записи nextUrl / exitUrl
  var pageHistory = [];

  function trackPageview() {
    var session = getSession();
    var url = window.location.pathname;

    // Записываем следующую страницу в предыдущий просмотр
    if (pageHistory.length > 0) {
      var prev = pageHistory[pageHistory.length - 1];
      if (prev._docId) {
        fsPatch('analytics_pageviews/' + prev._docId, { nextUrl: url });
      }
    }

    // Генерируем ID для нового документа pageview, чтобы иметь возможность его PATCH-ить
    var pvId = 'pv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);

    pageHistory.push({ url: url, ts: Date.now(), _docId: pvId });

    // Пишем просмотр (используем кастомный ID через PATCH-like создание)
    try {
      var xhr = new XMLHttpRequest();
      var docUrl = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
                   '/databases/(default)/documents/analytics_pageviews/' + pvId +
                   '?key=' + API_KEY;
      xhr.open('PATCH', docUrl, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ fields: toFields({
        sid:   session.id,
        ts:    Date.now(),
        url:   url,
        title: document.title || url,
        ref:   document.referrer.slice(0, 300) || '',
        nextUrl: '' // будет заполнено при переходе на следующую страницу
      })}));
    } catch(e) {
      // fallback: обычный POST без ID
      fsPost('analytics_pageviews', {
        sid:   session.id,
        ts:    Date.now(),
        url:   url,
        title: document.title || url,
        ref:   document.referrer.slice(0, 300) || ''
      });
    }
  }

  // ─── АКТИВНОЕ ВРЕМЯ ────────────────────────────────────────────────────────
  var activeStart = Date.now();
  var totalActive = 0;
  var tabVisible  = !document.hidden;

  function onVisible() {
    if (!tabVisible) { tabVisible = true; activeStart = Date.now(); }
  }
  function onHidden() {
    if (tabVisible) { totalActive += Date.now() - activeStart; tabVisible = false; }
  }

  document.addEventListener('visibilitychange', function() {
    document.hidden ? onHidden() : onVisible();
  });
  window.addEventListener('blur',  onHidden);
  window.addEventListener('focus', onVisible);

  // ─── ФИНАЛЬНАЯ ЗАПИСЬ ПРИ УХОДЕ ────────────────────────────────────────────
  // При уходе дополняем сессию: глубина, активное время, страница выхода.
  // Используем sendBeacon для надёжности (не обрывается при закрытии вкладки).
  function flushOnExit() {
    if (tabVisible) totalActive += Date.now() - activeStart;

    var session = currentSession;
    if (!session) return;

    var depth   = pageHistory.length || 1;
    var exitUrl = pageHistory.length ? pageHistory[pageHistory.length - 1].url : window.location.pathname;
    var activeSec = Math.round(totalActive / 1000);

    // Обновляем последний pageview — ставим nextUrl = '' (конец сессии)
    // и пишем активное время как событие
    if (activeSec > 2) {
      var evData = JSON.stringify({ fields: toFields({
        sid:       session.id,
        ts:        Date.now(),
        name:      'active_time',
        url:       window.location.pathname,
        p_seconds: activeSec
      })});
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            FS_BASE + 'analytics_events?key=' + API_KEY,
            new Blob([evData], { type: 'application/json' })
          );
        } else {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', FS_BASE + 'analytics_events?key=' + API_KEY, false); // синхронно
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(evData);
        }
      } catch(e) {}
    }

    // PATCH сессии: дописываем глубину, активное время и страницу выхода
    // Для этого нам нужен doc_id сессии в Firestore.
    // Так как мы создавали сессию через POST (auto-ID), doc_id нам неизвестен напрямую.
    // Вместо этого пишем отдельный документ в analytics_session_exit по sid.
    var exitData = JSON.stringify({ fields: toFields({
      sid:           session.id,
      ts:            Date.now(),
      depth:         depth,
      exitUrl:       exitUrl,
      activeSeconds: activeSec
    })});
    try {
      var url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
                '/databases/(default)/documents/analytics_session_exit/' +
                encodeURIComponent(session.id) + '?key=' + API_KEY;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([exitData], { type: 'application/json' }));
      } else {
        var xhr2 = new XMLHttpRequest();
        xhr2.open('PATCH', url, false);
        xhr2.setRequestHeader('Content-Type', 'application/json');
        xhr2.send(exitData);
      }
    } catch(e) {}
  }

  window.addEventListener('pagehide',     flushOnExit);
  window.addEventListener('beforeunload', flushOnExit);

  // ─── ГЛУБИНА СКРОЛЛА ───────────────────────────────────────────────────────
  var scrollFired = {};
  window.addEventListener('scroll', function() {
    var pct = Math.round(
      (window.scrollY + window.innerHeight) /
      (document.documentElement.scrollHeight || 1) * 100
    );
    [25, 50, 75, 90].forEach(function(mark) {
      if (pct >= mark && !scrollFired[mark]) {
        scrollFired[mark] = true;
        window.dcTrack('scroll_' + mark + 'pct', { url: window.location.pathname });
      }
    });
  }, { passive: true });

  // ─── КЛИКИ ─────────────────────────────────────────────────────────────────
  document.addEventListener('click', function(e) {
    var t = e.target;

    // Телефон
    var tel = t.closest('a[href^="tel:"]');
    if (tel) {
      window.dcTrack('phone_click', {
        phone: tel.href.replace('tel:', '').slice(0, 30),
        text:  (tel.textContent || '').trim().slice(0, 50)
      });
      return;
    }
    // Email
    var mail = t.closest('a[href^="mailto:"]');
    if (mail) {
      window.dcTrack('email_click', {
        email: mail.href.replace('mailto:', '').slice(0, 80)
      });
      return;
    }
    // Внешняя ссылка
    var a = t.closest('a[href]');
    if (a && a.href.indexOf('http') === 0 && a.href.indexOf(window.location.hostname) === -1) {
      window.dcTrack('outbound_click', {
        href: a.href.slice(0, 200),
        text: (a.textContent || '').trim().slice(0, 60)
      });
      return;
    }
    // Кнопка
    var btn = t.closest('button, input[type="submit"], input[type="button"], [role="button"]');
    if (btn) {
      window.dcTrack('button_click', {
        label: (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim().slice(0, 80),
        id:    (btn.id || btn.name || '').slice(0, 50),
        url:   window.location.pathname
      });
    }
  });

  // Отправка формы
  document.addEventListener('submit', function(e) {
    window.dcTrack('form_submit', {
      form: (e.target.id || e.target.name || e.target.action || 'unknown').slice(0, 80),
      url:  window.location.pathname
    });
  }, true);

  // ─── ВРЕМЯ НА СТРАНИЦЕ (маркеры) ───────────────────────────────────────────
  var timeMarks = [30, 60, 180, 300];
  var timeIdx   = 0;

  function scheduleTime() {
    if (timeIdx >= timeMarks.length) return;
    setTimeout(function() {
      window.dcTrack('time_on_page_' + timeMarks[timeIdx] + 's', {
        url: window.location.pathname
      });
      timeIdx++;
      scheduleTime();
    }, timeMarks[timeIdx] * 1000);
  }

  // ─── ПУБЛИЧНЫЙ API ─────────────────────────────────────────────────────────
  window.dcTrack = function(name, props) {
    var session = getSession();
    var data = {
      sid:  session.id,
      ts:   Date.now(),
      name: String(name),
      url:  window.location.pathname
    };
    if (props && typeof props === 'object') {
      Object.keys(props).forEach(function(k) { data['p_' + k] = props[k]; });
    }
    fsPost('analytics_events', data);
  };

  // ─── ЗАПУСК ────────────────────────────────────────────────────────────────
  function init() {
    trackPageview();
    scheduleTime();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
