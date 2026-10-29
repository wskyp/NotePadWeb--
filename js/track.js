/* global ND, chrome */
var ND = ND || {};

ND.track = (function () {
  "use strict";

  var URL = "http://127.0.0.1/eda_agent/notepad_web/cat";
  var sessionId = "";
  var installId = "";
  var ready = null;
  var visibleSince = 0;
  var visibleMs = 0;
  var left = false;
  var lastAction = "";
  var lastActionAt = 0;

  function enabled() {
    return ND.desktop && ND.desktop.inExtension();
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var n = Math.random() * 16 | 0;
      return (c === "x" ? n : (n & 0x3 | 0x8)).toString(16);
    });
  }

  function version() {
    try { return chrome.runtime.getManifest().version || ""; }
    catch (err) { return ""; }
  }

  function ensureId() {
    if (installId) return Promise.resolve(installId);
    if (!ready) {
      ready = Promise.resolve().then(function () {
        return chrome.storage.local.get("installId");
      }).then(function (data) {
        if (data && data.installId) return data.installId;
        var id = uuid();
        return chrome.storage.local.set({ installId: id }).then(function () { return id; });
      }).then(function (id) {
        installId = id;
        return id;
      }).catch(function () {
        installId = installId || uuid();
        return installId;
      });
    }
    return ready;
  }

  function send(event, action, durationMs) {
    try {
      if (!enabled()) return;
      ensureId().then(function (id) {
        var opts = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            installId: id,
            sessionId: sessionId,
            version: version(),
            event: event,
            action: action || "",
            ts: Date.now(),
            durationMs: durationMs || 0
          })
        };
        if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) opts.signal = AbortSignal.timeout(4000);
        return fetch(URL, opts);
      }).catch(function () {});
    } catch (err) {}
  }

  function markVisible() {
    if (document.visibilityState === "visible") {
      if (!visibleSince) visibleSince = Date.now();
      return;
    }
    if (visibleSince) {
      visibleMs += Date.now() - visibleSince;
      visibleSince = 0;
    }
  }

  function start() {
    try {
      if (!enabled() || sessionId) return;
      sessionId = uuid();
      visibleSince = Date.now();
      send("open", "open", 0);
      document.addEventListener("visibilitychange", markVisible);
      window.addEventListener("pagehide", function () {
        try {
          if (left) return;
          left = true;
          markVisible();
          send("leave", "leave", visibleMs);
        } catch (err) {}
      });
    } catch (err) {}
  }

  function action(name) {
    try {
      if (!enabled() || !name) return;
      var now = Date.now();
      if (name === lastAction && now - lastActionAt < 1000) return;
      lastAction = name;
      lastActionAt = now;
      send("action", name, 0);
    } catch (err) {}
  }

  return { start: start, action: action };
})();
