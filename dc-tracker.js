/**
 * DC Analytics Tracker v2.1
 * Пишет данные в Firestore через REST API.
 * Автоматически отслеживает: просмотры, скролл, клики по ссылкам, время на странице.
 */
(function () {
  'use strict';

  var PROJECT_ID = 'razrabotka-b61bc';
  var API_KEY    = 'AIzaSyAT4dDEIDUtzP60ibjahO06P75Q6h95ZN4';
  var FS_BASE    = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/';

  var SESSION_KEY   = 'dc_sess_v2';
  var RETURNING_KEY = 'dc_ret';
  var SESSION_TTL   = 30 * 60 * 1000;

  // ── УТИЛИТЫ ──────────────────────────────────
  function uid() { return 's' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

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
  function getSource(ref) {
    if (!ref) return 'direct';
    try {
      var h = new URL(ref).hostname;
      if (/google\.|yandex\.|bing\./i.test(h))                      return 'organic';
      if (/facebook|instagram|twitter|linkedin|vk\.|t\.me/i.test(h)) return 'social';
      return 'referral';
    } catch(e) { return 'referral'; }
  }
  function getTZ() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'; }
    catch(e) { return 'unknown'; }
  }

  // ── FIRESTORE POST ────────────────────────────
  function fsPost(collection, data) {
    var fields = {};
    Object.keys(data).forEach(function(k) {
      var v = data[k];
      if (v === null || v === undefined) {
        fields[k] = { nullValue: null };
      } else if (typeof v === 'boolean') {
        fields[k] = { booleanValue: v };
      } else if (typeof v === 'number') {
        fields[k] = { integerValue: String(Math.round(v)) };
      } else {
        fields[k] = { stringValue: String(v) };
      }
    });
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', FS_BASE + collection + '?key=' + API_KEY, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ fields: fields }));
    } catch(e) {}
  }

  // ── СЕССИЯ ───────────────────────────────────
  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (Date.now() - s.lastActivity < SESSION_TTL) {
          s.lastActivity = Date.now();
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
          return s;
        }
      }
    } catch(e) {}

    var ua = navigator.userAgent;
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

    try { localStorage.setItem(RETURNING_KEY, '1'); } catch(e) {}

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

    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch(e) {}
    return session;
  }

  // ── ПРОСМОТР СТРАНИЦЫ ────────────────────────
  function trackPageview() {
    var session = getSession();
    fsPost('analytics_pageviews', {
      sid:   session.id,
      ts:    Date.now(),
      url:   window.location.pathname,
      title: document.title || window.location.pathname,
      ref:   document.referrer || ''
    });
  }

  // ── ПУБЛИЧНЫЙ API ────────────────────────────
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

  // ── АВТО-СОБЫТИЯ ─────────────────────────────

  // 1. Глубина скролла (25%, 50%, 75%, 90%)
  var scrollFired = {};
  function onScroll() {
    var scrolled = window.scrollY + window.innerHeight;
    var total    = document.documentElement.scrollHeight || 1;
    var pct      = Math.round(scrolled / total * 100);
    [25, 50, 75, 90].forEach(function(mark) {
      if (pct >= mark && !scrollFired[mark]) {
        scrollFired[mark] = true;
        window.dcTrack('scroll_' + mark + 'pct', { url: window.location.pathname });
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // 2. Клики по внешним ссылкам
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.href || '';
    if (href.indexOf(window.location.hostname) === -1 && href.indexOf('http') === 0) {
      window.dcTrack('outbound_click', { href: href.slice(0, 200) });
    }
  });

  // 3. Время на странице (30с, 60с, 3мин)
  var timeMarks = [30, 60, 180];
  var timeIdx   = 0;
  function scheduleTime() {
    if (timeIdx >= timeMarks.length) return;
    var delay = timeMarks[timeIdx] * 1000;
    setTimeout(function() {
      window.dcTrack('time_on_page_' + timeMarks[timeIdx] + 's', { url: window.location.pathname });
      timeIdx++;
      scheduleTime();
    }, delay);
  }

  // ── ЗАПУСК ───────────────────────────────────
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
