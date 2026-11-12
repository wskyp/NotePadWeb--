/* global ND, Neutralino, NL_PORT, NL_OS, NL_ARGS, NL_DATAPATH, NL_APPID */
var ND = ND || {};

ND.desktop = (function () {
  "use strict";

  var started = null;
  var dataProfile = { dir: "", instance: "", label: "default", mode: "storage" };
  var APP_DATA_ID = "dev.notepadweb.desktop";

  function inElectron() {
    try {
      return !!(typeof window !== "undefined" && window.notepadDesktop && typeof window.notepadDesktop.invoke === "function");
    } catch (err) {
      return false;
    }
  }

  function inNeutralino() {
    return typeof Neutralino !== "undefined" && !!window.NL_PORT;
  }

  function inDesktop() {
    return inElectron() || inNeutralino();
  }

  function inExtension() {
    try {
      return location.protocol === "chrome-extension:" && typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id);
    } catch (err) {
      return false;
    }
  }

  function applyRemoteEnv(env) {
    if (ND.remote && typeof ND.remote.applyEnv === "function") ND.remote.applyEnv(env || {});
  }

  function cliArgs() {
    try {
      if (typeof NL_ARGS !== "undefined" && NL_ARGS && NL_ARGS.length) {
        return Array.prototype.slice.call(NL_ARGS);
      }
    } catch (err) { /* ignore */ }
    return [];
  }

  function argValue(names, args) {
    args = args || [];
    for (var i = 0; i < args.length; i++) {
      var a = String(args[i] || "");
      for (var n = 0; n < names.length; n++) {
        var key = names[n];
        if (a === key && args[i + 1]) return String(args[i + 1]);
        if (a.indexOf(key + "=") === 0) return a.slice(key.length + 1);
      }
    }
    return "";
  }

  function safeInstanceName(name) {
    var s = String(name || "").trim();
    if (!s) return "";
    s = s.replace(/[\\/]+/g, "-").replace(/\.\./g, "");
    s = s.replace(/[^\w.\u4e00-\u9fff-]+/g, "_");
    return s.slice(0, 64);
  }

  function storageKeySuffix(instance) {
    var s = String(instance || "").replace(/[^a-zA-Z0-9_-]/g, "");
    return s.slice(0, 24);
  }

  function scopedStorageKey(base) {
    var suffix = storageKeySuffix(dataProfile.instance);
    if (!suffix) return base;
    var key = base + "_" + suffix;
    return key.length > 50 ? key.slice(0, 50) : key;
  }

  function resolveAppDataRoot(envs) {
    envs = envs || {};
    try {
      if (typeof NL_DATAPATH !== "undefined" && NL_DATAPATH) {
        return String(NL_DATAPATH).replace(/[\\/]+$/, "");
      }
    } catch (err) { /* ignore */ }
    var id = APP_DATA_ID;
    try {
      if (typeof NL_APPID !== "undefined" && NL_APPID) id = String(NL_APPID);
    } catch (err) { /* ignore */ }
    if (onWindows()) {
      var appdata = envs.APPDATA || envs.LOCALAPPDATA || "";
      if (appdata) return joinPath(String(appdata).replace(/[\\/]+$/, ""), id);
      return joinPath("C:\\Users\\Public", id);
    }
    var xdg = envs.XDG_DATA_HOME || "";
    if (xdg) return joinPath(String(xdg).replace(/[\\/]+$/, ""), id);
    var home = envs.HOME || envs.USERPROFILE || "";
    if (home) return joinPath(joinPath(String(home).replace(/[\\/]+$/, ""), ".local/share"), id);
    return joinPath("/tmp", id);
  }

  function buildDataProfile(envs) {
    envs = envs || {};
    var args = cliArgs();
    var homeRoot = String(envs.NOTEPADWEB_HOME || "").trim().replace(/[\\/]+$/, "");
    var custom = String(
      argValue(["--data-dir", "--user-data-dir"], args) ||
      envs.NOTEPADWEB_DATA_DIR ||
      (homeRoot ? joinPath(homeRoot, "data") : "") ||
      ""
    ).trim();
    var instance = safeInstanceName(
      argValue(["--instance"], args) || envs.NOTEPADWEB_INSTANCE || ""
    );
    if (custom) {
      return {
        dir: custom.replace(/[\\/]+$/, ""),
        instance: instance,
        label: custom,
        mode: "files"
      };
    }
    if (instance) {
      var dir = joinPath(joinPath(resolveAppDataRoot(envs), "instances"), instance);
      return {
        dir: dir,
        instance: instance,
        label: "instance:" + instance,
        mode: "files"
      };
    }
    return { dir: "", instance: "", label: "default", mode: "storage" };
  }

  function applyWindowTitle() {
    var title = "NotePadWeb--";
    if (dataProfile.instance) title += " [" + dataProfile.instance + "]";
    else if (dataProfile.label && dataProfile.label !== "default") {
      title += " [" + baseName(dataProfile.dir || dataProfile.label) + "]";
    }
    if (inElectron()) return Promise.resolve();
    if (!inNeutralino() || !Neutralino.window || typeof Neutralino.window.setTitle !== "function") {
      return Promise.resolve();
    }
    return Neutralino.window.setTitle(title).catch(function () {});
  }

  function initDataProfile(envs) {
    if (inElectron()) {
      if (window.notepadDesktop && typeof window.notepadDesktop.dataDir === "function") {
        return window.notepadDesktop.dataDir().then(function (info) {
          dataProfile = {
            dir: (info && info.dir) || "",
            instance: (info && info.instance) || "",
            label: (info && info.label) || "default",
            mode: "storage"
          };
          return dataProfile;
        }).catch(function () {
          dataProfile = buildDataProfile((window.notepadDesktop && window.notepadDesktop.env) || {});
          return dataProfile;
        });
      }
      dataProfile = buildDataProfile((window.notepadDesktop && window.notepadDesktop.env) || {});
      return Promise.resolve(dataProfile);
    }
    dataProfile = buildDataProfile(envs || {});
    var prep = Promise.resolve();
    if (dataProfile.mode === "files" && dataProfile.dir) {
      prep = Neutralino.filesystem.createDirectory(dataProfile.dir).catch(function () {});
    }
    return prep.then(applyWindowTitle).then(function () { return dataProfile; });
  }

  function loadRemoteEnv() {
    if (inElectron()) {
      try {
        applyRemoteEnv((window.notepadDesktop && window.notepadDesktop.env) || {});
      } catch (err) { /* ignore */ }
      return initDataProfile(null);
    }
    if (!inNeutralino() || !Neutralino.os || typeof Neutralino.os.getEnvs !== "function") {
      return initDataProfile({});
    }
    return Neutralino.os.getEnvs().then(function (envs) {
      applyRemoteEnv(envs || {});
      return initDataProfile(envs || {});
    }).catch(function () {
      return initDataProfile({});
    });
  }

  function ready() {
    if (!inDesktop()) return Promise.resolve();
    if (inElectron()) {
      if (!started) started = loadRemoteEnv();
      return started;
    }
    if (!started) {
      started = new Promise(function (resolve, reject) {
        try {
          Neutralino.init();
          resolve();
        } catch (err) {
          reject(err);
        }
      }).then(loadRemoteEnv);
    }
    return started;
  }

  function getDataProfile() {
    return {
      dir: dataProfile.dir,
      instance: dataProfile.instance,
      label: dataProfile.label,
      mode: dataProfile.mode
    };
  }

  function reject(err) {
    var msg = (err && (err.message || err.code)) || err || "本机接口失败";
    return Promise.reject(new Error(String(msg)));
  }

  function onWindows() {
    if (inElectron() && window.notepadDesktop.platform) return window.notepadDesktop.platform === "win32";
    return window.NL_OS === "Windows" || /Win/i.test(navigator.platform || "");
  }

  function sep() {
    return onWindows() ? "\\" : "/";
  }

  function parentOf(path) {
    return String(path || "").replace(/[\\/][^\\/]*$/, "");
  }

  function joinPath(dir, name) {
    var base = String(dir || "").replace(/[\\/]+$/, "");
    return base + sep() + name;
  }

  function bytesToBase64(bytes) {
    var bin = "";
    var step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    if (!b64) return new Uint8Array(0);
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function baseName(path) {
    var s = String(path || "").replace(/\\/g, "/");
    var i = s.lastIndexOf("/");
    var name = i >= 0 ? s.slice(i + 1) : s;
    return name || s;
  }

  function normAbs(path) {
    var s = String(path || "");
    if (onWindows()) return s.replace(/\//g, "\\").toLowerCase();
    return s;
  }

  function emptyToNull(value) {
    if (value == null || value === "") return null;
    return value;
  }

  function pickFiles() {
    if (inElectron()) return window.notepadDesktop.invoke("pick_files");
    return Neutralino.os.showOpenDialog("打开文件", { multiSelections: true }).then(function (paths) {
      return paths && paths.length ? paths : null;
    }, function () { return null; });
  }

  function pickFolder() {
    if (inElectron()) return window.notepadDesktop.invoke("pick_folder");
    return Neutralino.os.showFolderDialog("打开文件夹").then(emptyToNull, function () { return null; });
  }

  function pickSave(suggested) {
    if (inElectron()) return window.notepadDesktop.invoke("pick_save", { suggested: suggested });
    return Neutralino.os.showSaveDialog("另存为", { defaultPath: suggested || "untitled.txt" }).then(emptyToNull, function () { return null; });
  }

  function fileMeta(path) {
    if (inElectron()) return window.notepadDesktop.invoke("file_meta", { path: path });
    return Neutralino.filesystem.getStats(path).then(function (stats) {
      return {
        name: baseName(path),
        size: stats.isDirectory ? 0 : (stats.size || 0),
        isDir: !!stats.isDirectory,
        mtime: stats.modifiedAt || 0
      };
    });
  }

  function readFileRange(path, start, len) {
    if (inElectron()) return window.notepadDesktop.invoke("read_file_range", { path: path, start: start || 0, len: len || 0 });
    if (!len || len <= 0) return Promise.resolve("");
    return fileMeta(path).then(function (meta) {
      if (meta.isDir || start >= meta.size) return "";
      var take = Math.min(len, meta.size - start, 8 * 1024 * 1024);
      return Neutralino.filesystem.readBinaryFile(path, { pos: start, size: take }).then(function (buf) {
        return bytesToBase64(new Uint8Array(buf));
      });
    });
  }

  function writeFile(path, data) {
    if (inElectron()) return window.notepadDesktop.invoke("write_file", { path: path, data: data || "" });
    var bytes = base64ToBytes(data);
    var parent = parentOf(path);
    var tmp = joinPath(parent || ".", "." + baseName(path) + ".notepadweb-tmp");
    var prepare = parent ? Neutralino.filesystem.createDirectory(parent).catch(function () {}) : Promise.resolve();
    return prepare.then(function () {
      return Neutralino.filesystem.writeBinaryFile(tmp, bytes.buffer);
    }).then(function () {
      return Neutralino.filesystem.move(tmp, path).catch(function () {
        return Neutralino.filesystem.writeBinaryFile(path, bytes.buffer).then(function () {
          return Neutralino.filesystem.remove(tmp).catch(function () {});
        });
      });
    });
  }

  function shellQuote(value) {
    var s = String(value == null ? "" : value);
    if (onWindows()) return "'" + s.replace(/'/g, "''") + "'";
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }

  function listLinkInfo(dir) {
    var cmd;
    if (onWindows()) {
      // LinkType 覆盖符号链接；ReparsePoint 再兜底 junction 等重解析点。
      cmd = "powershell -NoProfile -Command " +
        "\"Get-ChildItem -LiteralPath " + shellQuote(dir) + " -Force | " +
        "Where-Object { $_.LinkType -or (($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) } | " +
        "ForEach-Object { $_.Name + [char]9 + ($(if ($_.LinkType) { $_.LinkType } else { 'Reparse' })) + [char]9 + " +
        "((@($_.Target) | ForEach-Object { $_ }) -join ';') }\"";
    } else {
      cmd = "find " + shellQuote(dir) + " -mindepth 1 -maxdepth 1 -type l -printf '%f\\t%l\\n'";
    }
    return Neutralino.os.execCommand(cmd).then(function (res) {
      var map = {};
      String((res && res.stdOut) || "").split(/\r?\n/).forEach(function (line) {
        line = String(line || "").replace(/^\uFEFF/, "").trim();
        if (!line) return;
        var parts = line.split("\t");
        var name = parts[0];
        if (!name) return;
        if (onWindows()) {
          map[name] = {
            kind: parts[1] || "symlink",
            target: parts.slice(2).join("\t") || ""
          };
        } else {
          map[name] = {
            kind: "symlink",
            target: parts.slice(1).join("\t") || ""
          };
        }
      });
      return map;
    }, function () {
      return {};
    });
  }

  function listDir(path) {
    if (inElectron()) return window.notepadDesktop.invoke("list_dir", { path: path });
    return Promise.all([
      Neutralino.filesystem.readDirectory(path),
      listLinkInfo(path)
    ]).then(function (pair) {
      var entries = pair[0] || [];
      var links = pair[1] || {};
      var seen = Object.create(null);
      var items = [];
      entries.forEach(function (entry) {
        if (!entry || entry.entry === "." || entry.entry === "..") return;
        var name = entry.entry;
        seen[name] = true;
        var link = links[name];
        var other = entry.type === "OTHER";
        items.push({
          name: name,
          kind: entry.type === "DIRECTORY" ? "dir" : "file",
          path: entry.path || joinPath(path, name),
          mtime: 0,
          size: 0,
          link: !!(link || other),
          linkTarget: (link && link.target) || "",
          broken: false
        });
      });
      // Neutralino 有时会漏掉软链接项，用本机查询补上。
      Object.keys(links).forEach(function (name) {
        if (seen[name]) return;
        items.push({
          name: name,
          kind: "file",
          path: joinPath(path, name),
          mtime: 0,
          size: 0,
          link: true,
          linkTarget: links[name].target || "",
          broken: false
        });
      });
      return Promise.all(items.map(function (item) {
        return Neutralino.filesystem.getStats(item.path).then(function (stats) {
          item.mtime = stats.modifiedAt || 0;
          item.size = stats.size || 0;
          item.kind = stats.isDirectory ? "dir" : "file";
          item.broken = false;
          return item;
        }, function () {
          item.broken = !!item.link;
          return item;
        });
      }));
    });
  }

  function validName(name) {
    return !!name && name.indexOf("/") < 0 && name.indexOf("\\") < 0 && name !== "." && name !== "..";
  }

  function createEntry(dir, name, kind) {
    if (inElectron()) return window.notepadDesktop.invoke("create_entry", { dir: dir, name: name, kind: kind });
    if (!validName(name)) return Promise.reject(new Error("名称不合法"));
    var path = joinPath(dir, name);
    return fileMeta(path).then(function () {
      return Promise.reject(new Error("已存在同名项目"));
    }, function () {
      if (kind === "dir") return Neutralino.filesystem.createDirectory(path).then(function () { return path; });
      return Neutralino.filesystem.writeBinaryFile(path, new ArrayBuffer(0)).then(function () { return path; });
    });
  }

  function renamePath(path, name) {
    if (inElectron()) return window.notepadDesktop.invoke("rename_path", { path: path, name: name });
    if (!validName(name)) return Promise.reject(new Error("名称不合法"));
    var parent = parentOf(path);
    if (!parent) return Promise.reject(new Error("没有上级目录"));
    var dest = joinPath(parent, name);
    return Neutralino.filesystem.move(path, dest).then(function () { return dest; });
  }

  function removePath(path) {
    if (inElectron()) return window.notepadDesktop.invoke("remove_path", { path: path });
    return Neutralino.filesystem.remove(path);
  }

  function resolvePath(base, rel) {
    if (inElectron()) return window.notepadDesktop.invoke("resolve_path", { base: base, rel: rel });
    var parts = parentOf(base).split(/[\\/]/);
    String(rel || "").replace(/\\/g, "/").split("/").forEach(function (part) {
      if (!part || part === ".") return;
      if (part === "..") {
        if (parts.length > 1) parts.pop();
        return;
      }
      parts.push(part);
    });
    var joined = parts.join(sep());
    if (!onWindows() && joined.charAt(0) !== "/") return "/" + joined.replace(/^\/+/, "");
    return joined || (onWindows() ? parentOf(base) : "/");
  }

  function invoke(cmd, args) {
    args = args || {};
    if (inElectron()) {
      return window.notepadDesktop.invoke(cmd, args).catch(function (err) {
        if (err instanceof Error) throw err;
        return reject(err);
      });
    }
    return ready().then(function () {
      if (cmd === "pick_files") return pickFiles();
      if (cmd === "pick_folder") return pickFolder();
      if (cmd === "pick_save") return pickSave(args.suggested);
      if (cmd === "file_meta") return fileMeta(args.path);
      if (cmd === "read_file_range") return readFileRange(args.path, args.start || 0, args.len || 0);
      if (cmd === "write_file") return writeFile(args.path, args.data || "");
      if (cmd === "list_dir") return listDir(args.path);
      if (cmd === "create_entry") return createEntry(args.dir, args.name, args.kind);
      if (cmd === "rename_path") return renamePath(args.path, args.name);
      if (cmd === "remove_path") return removePath(args.path);
      if (cmd === "resolve_path") return resolvePath(args.base, args.rel);
      return Promise.reject(new Error("未知命令 " + cmd));
    }).catch(function (err) {
      if (err instanceof Error) throw err;
      return reject(err);
    });
  }

  function readRange(path, start, end) {
    var chunk = 4 * 1024 * 1024;
    function one(from, to) {
      return invoke("read_file_range", { path: path, start: from, len: Math.max(0, to - from) }).then(base64ToBytes);
    }
    function join(parts) {
      var total = 0;
      for (var i = 0; i < parts.length; i++) total += parts[i].length;
      var out = new Uint8Array(total);
      var at = 0;
      for (var j = 0; j < parts.length; j++) {
        out.set(parts[j], at);
        at += parts[j].length;
      }
      return out;
    }
    if (end - start <= chunk) return one(start, end);
    var parts = [];
    function step(from) {
      if (from >= end) return Promise.resolve(join(parts));
      var to = Math.min(end, from + chunk);
      return one(from, to).then(function (bytes) {
        parts.push(bytes);
        if (bytes.length < to - from) return join(parts);
        return step(to);
      });
    }
    return step(start);
  }

  function lazyFile(path, size, name) {
    return {
      name: name || baseName(path),
      size: size,
      arrayBuffer: function () {
        return readRange(path, 0, size).then(function (bytes) { return bytes.buffer; });
      },
      slice: function (start, end) {
        var from = start || 0;
        var to = end == null ? size : end;
        return {
          arrayBuffer: function () {
            return readRange(path, from, to).then(function (bytes) { return bytes.buffer; });
          }
        };
      }
    };
  }

  function onWindowClose(shouldExit) {
    if (inElectron()) {
      window.notepadDesktop.onCloseRequest(shouldExit);
      return Promise.resolve();
    }
    return ready().then(function () {
      Neutralino.events.on("windowClose", function () {
        var result;
        try { result = shouldExit(); }
        catch (err) { return; }
        Promise.resolve(result).then(function (ok) {
          if (ok) Neutralino.app.exit();
        }).catch(function () {});
      });
    });
  }

  function encodeText(str) {
    var s = str == null ? "" : String(str);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  function decodeText(buf) {
    var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
    if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(bytes);
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (err) { return s; }
  }

  function fileStorePath(key) {
    return joinPath(dataProfile.dir, key + ".json");
  }

  function fileStoreSet(key, value) {
    var path = fileStorePath(key);
    if (value == null) {
      return Neutralino.filesystem.remove(path).catch(function () {});
    }
    var bytes = encodeText(String(value));
    return Neutralino.filesystem.createDirectory(dataProfile.dir).catch(function () {}).then(function () {
      return Neutralino.filesystem.writeBinaryFile(path, bytes.buffer);
    });
  }

  function fileStoreGet(key) {
    return Neutralino.filesystem.readBinaryFile(fileStorePath(key)).then(function (buf) {
      return decodeText(buf);
    }).catch(function () {
      return null;
    });
  }

  function storeSet(key, value) {
    key = String(key || "");
    if (!key) return Promise.resolve();
    if (inElectron()) {
      try { localStorage.setItem(key, value == null ? "" : String(value)); } catch (err) { /* ignore */ }
      return Promise.resolve();
    }
    if (inNeutralino()) {
      return ready().then(function () {
        if (dataProfile.mode === "files" && dataProfile.dir) {
          return fileStoreSet(key, value);
        }
        var sk = scopedStorageKey(key);
        if (value == null) return Neutralino.storage.removeData(sk).catch(function () {});
        return Neutralino.storage.setData(sk, String(value));
      }).catch(function () {});
    }
    try { localStorage.setItem(key, value == null ? "" : String(value)); } catch (err) { /* ignore */ }
    return Promise.resolve();
  }

  function storeGet(key) {
    key = String(key || "");
    if (!key) return Promise.resolve(null);
    if (inElectron()) {
      try { return Promise.resolve(localStorage.getItem(key)); } catch (err) { return Promise.resolve(null); }
    }
    if (inNeutralino()) {
      return ready().then(function () {
        if (dataProfile.mode === "files" && dataProfile.dir) {
          return fileStoreGet(key);
        }
        return Neutralino.storage.getData(scopedStorageKey(key));
      }).then(function (data) {
        return data == null ? null : String(data);
      }).catch(function () {
        return null;
      });
    }
    try { return Promise.resolve(localStorage.getItem(key)); } catch (err) { return Promise.resolve(null); }
  }

  return {
    inDesktop: inDesktop,
    inExtension: inExtension,
    ready: ready,
    onWindowClose: onWindowClose,
    invoke: invoke,
    storeSet: storeSet,
    storeGet: storeGet,
    getDataProfile: getDataProfile,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    baseName: baseName,
    normAbs: normAbs,
    readRange: readRange,
    lazyFile: lazyFile
  };
})();
