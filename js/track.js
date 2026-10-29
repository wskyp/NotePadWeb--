/* global ND, chrome */
var ND = ND || {};

ND.track = (function () {
  "use strict";

  var sessionId = "";
  var installId = "";
  var ready = null;
  var visibleSince = 0;
  var visibleMs = 0;
  var left = false;
  var lastAction = "";
  var lastActionAt = 0;

  function remoteUrl(name) {
    if (ND.remote && typeof ND.remote.url === "function") return ND.remote.url(name);
    return "";
  }

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
        return fetch(remoteUrl("cat"), opts);
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

  function parseVersion(text) {
    return String(text || "").trim().replace(/^v/i, "").split(/[.+-]/).map(function (part) {
      var n = parseInt(part, 10);
      return isNaN(n) ? 0 : n;
    });
  }

  function versionNewer(remote, local) {
    var a = parseVersion(remote);
    var b = parseVersion(local);
    var len = Math.max(a.length, b.length);
    for (var i = 0; i < len; i++) {
      var x = a[i] || 0;
      var y = b[i] || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  }

  function fetchUpdateInfo() {
    var opts = { method: "GET", cache: "no-store" };
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) opts.signal = AbortSignal.timeout(4000);
    return fetch(remoteUrl("version"), opts).then(function (res) {
      if (!res.ok) throw new Error("version " + res.status);
      return res.json();
    }).then(function (data) {
      return {
        version: data && data.version ? String(data.version) : "",
        url: data && data.url ? String(data.url) : remoteUrl("update.zip")
      };
    }).catch(function () {
      return { version: "", url: remoteUrl("update.zip") };
    });
  }

  function downloadUpdate(url) {
    return new Promise(function (resolve, reject) {
      try {
        if (!enabled() || !chrome.downloads || !chrome.downloads.download) {
          reject(new Error("当前环境不能下载更新"));
          return;
        }
        chrome.downloads.download({
          url: url || remoteUrl("update.zip"),
          filename: "NotePadWeb-chrome.zip",
          conflictAction: "uniquify",
          saveAs: false
        }, function (id) {
          if (chrome.runtime.lastError || id == null) {
            reject(new Error((chrome.runtime.lastError && chrome.runtime.lastError.message) || "下载失败"));
            return;
          }
          function done(ok, detail) {
            chrome.downloads.onChanged.removeListener(onChanged);
            if (ok) resolve(detail);
            else reject(new Error(detail || "下载失败"));
          }
          function onChanged(delta) {
            if (!delta || delta.id !== id) return;
            if (delta.error && delta.error.current) {
              done(false, delta.error.current);
              return;
            }
            if (!(delta.state && delta.state.current)) return;
            if (delta.state.current === "complete") {
              chrome.downloads.search({ id: id }, function (items) {
                var item = items && items[0];
                done(true, {
                  id: id,
                  filename: (item && item.filename) || "NotePadWeb-chrome.zip"
                });
              });
              return;
            }
            if (delta.state.current === "interrupted") done(false, "下载中断");
          }
          chrome.downloads.onChanged.addListener(onChanged);
        });
      } catch (err) {
        reject(err || new Error("下载失败"));
      }
    });
  }

  function reloadExtension() {
    try { chrome.runtime.reload(); }
    catch (err) {}
  }

  function update() {
    if (!enabled()) return Promise.reject(new Error("只有 Chrome 插件可以使用更新"));
    var local = version();
    return fetchUpdateInfo().then(function (info) {
      if (info.version && !versionNewer(info.version, local)) {
        return { status: "latest", version: local, remote: info.version };
      }
      return downloadUpdate(info.url).then(function (file) {
        return {
          status: "downloaded",
          version: local,
          remote: info.version || "",
          filename: file.filename
        };
      });
    });
  }

  return {
    start: start,
    action: action,
    update: update,
    reloadExtension: reloadExtension,
    version: version
  };
})();
