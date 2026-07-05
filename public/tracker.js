(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var siteId = script.getAttribute("data-site");
  if (!siteId) return;

  if (isOptedOut()) return;

  var base = script.src.replace(/\/tracker\.js.*$/, "");
  var endpoint = base + "/api/event";
  var debounceTimer = null;
  var exclusions = parseExclusions(script.getAttribute("data-exclude"));

  function isOptedOut() {
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return true;
    if (navigator.globalPrivacyControl === true) return true;
    var meta = document.querySelector('meta[name="local-analytics"]');
    if (meta && meta.getAttribute("content") === "disabled") return true;
    return false;
  }

  function parseExclusions(raw) {
    if (!raw) return [];
    return raw.split(",").map(function (s) {
      return s.trim();
    }).filter(Boolean);
  }

  function isExcluded(pathname) {
    return exclusions.some(function (prefix) {
      return pathname === prefix || pathname.indexOf(prefix + "/") === 0;
    });
  }

  function referrerHostname() {
    var ref = document.referrer;
    if (!ref) return null;
    try {
      return new URL(ref).hostname;
    } catch (e) {
      return null;
    }
  }

  function readUtm() {
    var params;
    try {
      params = new URLSearchParams(location.search);
    } catch (e) {
      return { utm_source: null, utm_medium: null, utm_campaign: null };
    }
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    };
  }

  function sendPayload(extra) {
    var pathname = location.pathname || "/";
    if (extra && extra.event_type !== "custom" && isExcluded(pathname)) return;

    var utm = readUtm();
    var payload = {
      site_id: siteId,
      pathname: pathname,
      hostname: location.hostname,
      referrer: referrerHostname(),
      screen_width: window.screen && window.screen.width ? window.screen.width : 0,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      event_type: "pageview",
    };

    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) {
          payload[key] = extra[key];
        }
      }
    }

    var body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true,
    }).catch(function () {});
  }

  function sendEvent() {
    sendPayload({ event_type: "pageview" });
  }

  function track(eventName) {
    if (!eventName || typeof eventName !== "string") return;
    sendPayload({
      event_type: "custom",
      event_name: eventName.slice(0, 64),
    });
  }

  function debouncedSend() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendEvent, 300);
  }

  function patchHistory(method) {
    var original = history[method];
    history[method] = function () {
      var result = original.apply(this, arguments);
      debouncedSend();
      return result;
    };
  }

  window.localAnalytics = { track: track };

  if (document.readyState === "complete") {
    sendEvent();
  } else {
    window.addEventListener("load", sendEvent);
  }

  patchHistory("pushState");
  patchHistory("replaceState");
  window.addEventListener("popstate", debouncedSend);

  document.addEventListener("click", function (e) {
    var anchor = e.target;
    while (anchor && anchor.tagName !== "A") {
      anchor = anchor.parentElement;
    }
    if (!anchor || !anchor.href) return;
    try {
      var url = new URL(anchor.href);
      if (url.hostname === location.hostname) return;
      track("outbound:" + url.hostname);
    } catch (err) {
      /* ignore */
    }
  }, true);
})();
