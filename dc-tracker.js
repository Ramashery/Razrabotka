/**
 * DC Analytics Tracker v2.0
 * Записывает данные напрямую в Firestore через REST API.
 * Подключается на каждой странице сайта перед </body>.
 *
 * Firestore коллекции:
 *   analytics_sessions  — одна запись на сессию
 *   analytics_pageviews — одна запись на просмотр страницы
 *   analytics_events    — одна запись на кастомное событие
 */
(function () {
  'use strict';

  // ── КОНФИГУРАЦИЯ ──────────────────────────────────────────
  var PROJECT_ID = 'razrabotka-b61bc';
  var API_KEY    = 'AIzaSyAT4dDEIDUtzP60ibjahO06P75Q6h95ZN4';
  var FIRESTORE  = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/';

  var SESSION_KEY     = 'dc_sess_v2';
  var RETURNING_KEY   = 'dc_ret';
  var SESSION_TIMEOUT = 30 * 60 * 1000; // 30 минут

  // ── УТИЛИТЫ ───────────────────────────────────────────────
  function uid() {
    return 's' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function getBrowser(ua) {
    if (/Edg\//i.test(ua))      return 'Edge';
    if (/OPR|Opera/i.test(ua))  return 'Opera';
    if (/YaBrowser/i.test(ua))  return 'Yandex';
    if (/Chrome/i.test(ua))     return 'Chrome';
    if (/Firefox/i.test(ua))    return 'Firefox';
    if (/Safari/i.test(ua))     return 'Safari';
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
    if (/iPad|Tablet/i.test(ua))                return 'tablet';
    if (/Mobile|Android|iPhone/i.test(ua))      return 'mobile';
    return 'desktop';
  }

  function getSource(ref) {
    if (!ref) return 'direct';
    try {
      var h = new URL(ref).hostname;
      if (/google\.|yandex\.|bing\./i.test(h))                    return 'organic';
      if (/facebook|instagram|twitter|linkedin|vk\.|t\.me/i.test(h)) return 'social';
      return 'referral';
    } catch (e) { return 'referral'; }
  }

  function getTZ() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'; }
    catch (e) { return 'unknown'; }
  }

  // ── FIRESTORE REST: POST документ ────────────────────────
  function fsPost(collection, data) {
    var url = FIRESTORE + collection + '?key=' + API_KEY;
    // Конвертируем плоский объект в Firestore fields format
    var fields = {};
    Object.keys(data).forEach(function (k) {
      var v = data[k];
      if (v === null || v === undefined) {
        fields[k] = { nullValue: null };
      } else if (typeof v === 'boolean') {
        fields[k] = { booleanValue: v };
      } else if (typeof v === 'number') {
        fields[k] = { integerValue: String(v) };
      } else {
        fields[k] = { stringValue: String(v) };
      }
    });

    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ fields: fields }));
    } catch (e) { /* молча игнорируем */ }
  }

  // ── СЕССИЯ ────────────────────────────────────────────────
  function getOrCreateSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (Date.now() - s.lastActivity < SESSION_TIMEOUT) {
          s.lastActivity = Date.now();
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
          return s;
        }
      }
    } catch (e) {}

    var ua   = navigator.userAgent;
    var isNew = !localStorage.getItem(RETURNING_KEY);

    var session = {
      id:           uid(),
      ts:           Date.now(),
      lastActivity: Date.now(),
      src:          getSource(document.referrer),
      ref:          document.referrer || '',
      dev:          getDevice(ua),
      br:           getBrowser(ua),
      os:           getOS(ua),
      lang:         navigator.language || 'unknown',
      tz:           getTZ(),
      isNew:        isNew,
      startUrl:     window.location.pathname
    };

    // Помечаем посетителя как вернувшегося
    try { localStorage.setItem(RETURNING_KEY, '1'); } catch (e) {}

    // Пишем сессию в Firestore
    fsPost('analytics_sessions', {
      id:       session.id,
      ts:       session.ts,
      src:      session.src,
      ref:      session.ref,
      dev:      session.dev,
      br:       session.br,
      os:       session.os,
      lang:     session.lang,
      tz:       session.tz,
      isNew:    session.isNew,
      startUrl: session.startUrl
    });

    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
    return session;
  }

  // ── ПРОСМОТР СТРАНИЦЫ ─────────────────────────────────────
  function trackPageview() {
    var session = getOrCreateSession();
    fsPost('analytics_pageviews', {
      sid:   session.id,
      ts:    Date.now(),
      url:   window.location.pathname,
      title: document.title || window.location.pathname,
      ref:   document.referrer || ''
    });
  }

  // ── КАСТОМНОЕ СОБЫТИЕ (публичный API) ────────────────────
  window.dcTrack = function (name, props) {
    var session = getOrCreateSession();
    var flat = { sid: session.id, ts: Date.now(), name: String(name), url: window.location.pathname };
    // Добавляем props как отдельные поля с префиксом p_
    if (props && typeof props === 'object') {
      Object.keys(props).forEach(function (k) { flat['p_' + k] = props[k]; });
    }
    fsPost('analytics_events', flat);
  };

  // ── ЗАПУСК ────────────────────────────────────────────────
  // Ждём загрузки DOM чтобы получить document.title
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageview);
  } else {
    trackPageview();
  }

})();
