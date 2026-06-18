/**
 * ABM Engine — website tracking snippet (Engine 07, Signal Engine).
 *
 * Generic static version. Embed with your workspace token:
 *   <script async src="https://app.example.com/tracker.js"
 *           data-token="abmtrk_xxx"
 *           data-endpoint="https://app.example.com/api/v1/signals/track"></script>
 *
 * (The per-workspace served snippet at /api/v1/signals/snippet/:token bakes these
 * in for you.) Fires a pageview on load and on SPA route changes; identifies the
 * visitor's company server-side. No cookies, no PII in the payload.
 */
(function () {
  var script = document.currentScript;
  var TOKEN = script && script.getAttribute('data-token');
  var ENDPOINT = (script && script.getAttribute('data-endpoint')) || '/api/v1/signals/track';
  if (!TOKEN) return;

  function sessionId() {
    try {
      var k = '_abm_sid';
      var v = localStorage.getItem(k);
      if (!v) {
        v = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(k, v);
      }
      return v;
    } catch (e) {
      return 'anon';
    }
  }

  function track() {
    try {
      var body = JSON.stringify({ token: TOKEN, url: location.href, session_id: sessionId() });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
      }
    } catch (e) { /* never break the host page */ }
  }

  track();
  var _push = history.pushState;
  history.pushState = function () { _push.apply(this, arguments); track(); };
  addEventListener('popstate', track);
})();
