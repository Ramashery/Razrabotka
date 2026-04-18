/**
 * DC Analytics Tracker v3.0 — Digital Craft Tbilisi
 * Новое в v3:
 *   - UTM-метки (utm_source, utm_medium, utm_campaign, utm_term, utm_content)
 *   - Активное время (без учёта неактивной вкладки)
 *   - Клики по кнопкам, формам, телефонам, email, внешним ссылкам
 *   - Referrer: полный URL + домен
 *   - IP-геолокация через Python-бэкенд
 */
(function () {
  'use strict';

  var PROJECT_ID = 'razrabotka-b61bc';
  var API_KEY    = 'AIzaSyAT4dDEIDUtzP60ibjahO06P75Q6h95ZN4';
  var FS_BASE    = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/';

  // URL Python-бэкенда. После деплоя замени на реальный адрес.
  // Пример: 'https://dc-analytics.onrender.com/geo'
  var GEO_ENDPOINT = 'https://YOUR_BACKEND_URL/geo';

  var SESSION_KEY   = 'dc_sess_v3';
  var RETURNING_KEY = 'dc_ret';
  var SESSION_TTL   = 30 * 60 * 1000;

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

  // ─── ГЕОЛОКАЦИЯ ────────────────────────────────────────────────────────────
  // Бэкенд определяет IP, возвращает {country, city, region}
  // и сам дописывает данные в Firestore по session_id
  function fetchGeo(sessionId) {
    if (!GEO_ENDPOINT || GEO_ENDPOINT.indexOf('YOUR_BACKEND_URL') !== -1) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', GEO_ENDPOINT + '?sid=' + sessionId, true);
      xhr.timeout = 5000;
      xhr.send();
    } catch(e) {}
  }

  // ─── СЕССИЯ ────────────────────────────────────────────────────────────────
  var currentSession = null;

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

    fsPost('analytics_sessions', {
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
    });

    // Запрашиваем геолокацию — бэкенд сам найдёт запись по session_id и допишет страну
    fetchGeo(session.id);

    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch(e) {}
    currentSession = session;
    return session;
  }

  // ─── ПРОСМОТР СТРАНИЦЫ ─────────────────────────────────────────────────────
  function trackPageview() {
    var session = getSession();
    fsPost('analytics_pageviews', {
      sid:   session.id,
      ts:    Date.now(),
      url:   window.location.pathname,
      title: document.title || window.location.pathname,
      ref:   document.referrer.slice(0, 300) || ''
    });
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

  function flushActiveTime() {
    if (tabVisible) totalActive += Date.now() - activeStart;
    if (totalActive > 2000 && currentSession) {
      window.dcTrack('active_time', { seconds: Math.round(totalActive / 1000) });
    }
  }
  window.addEventListener('pagehide',     flushActiveTime);
  window.addEventListener('beforeunload', flushActiveTime);

  // ─── ГЛУБИНА СКРОЛЛА ───────────────────────────────────────────────────────
  var scrollFired = {};
  window.addEventListener('scroll', function() {
    var pct = Math.round((window.scrollY + window.innerHeight) /
              (document.documentElement.scrollHeight || 1) * 100);
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
    var data = { sid: session.id, ts: Date.now(), name: String(name), url: window.location.pathname };
    if (props && typeof props === 'object') {
      Object.keys(props).forEach(function(k) { data['p_' + k] = props[k]; });
    }
    fsPost('analytics_events', data);
  };

  // ─── ЗАПУСК ────────────────────────────────────────────────────────────────
  function init() { trackPageview(); scheduleTime(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
