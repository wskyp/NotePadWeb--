/* global ND, Neutralino, NL_PORT, NL_OS */
var ND = ND || {};

ND.desktop = (function () {
  "use strict";

  var started = null;

  function inDesktop() {
    return typeof Neutralino !== "undefined" && !!window.NL_PORT;
  }

  function inExtension() {
    try {
      return location.protocol === "chrome-extension:" && typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id);
    } catch (err) {
      return false;
    }
  }

  function ready() {
    if (!inDesktop()) return Promise.resolve();
    if (!started) {
      started = new Promise(function (resolve, reject) {
        try {
          Neutralino.init();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }
    return started;
  }

  function reject(err) {
    var msg = (err && (err.message || err.code)) || err || "本机接口失败";
    return Promise.reject(new Error(String(msg)));
  }

  function onWindows() {
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
    return Neutralino.os.showOpenDialog("打开文件", { multiSelections: true }).then(function (paths) {
      return paths && paths.length ? paths : null;
    }, function () { return null; });
  }

  function pickFolder() {
    return Neutralino.os.showFolderDialog("打开文件夹").then(emptyToNull, function () { return null; });
  }

  function pickSave(suggested) {
    return Neutralino.os.showSaveDialog("另存为", { defaultPath: suggested || "untitled.txt" }).then(emptyToNull, function () { return null; });
  }

  function fileMeta(path) {
    return Neutralino.filesystem.getStats(path).then(function (stats) {
      return {
        name: baseName(path),
        size: stats.isDirectory ? 0 : (stats.size || 0),
        isDir: !!stats.isDirectory
      };
    });
  }

  function readFileRange(path, start, len) {
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

  function listDir(path) {
    return Neutralino.filesystem.readDirectory(path).then(function (entries) {
      var items = [];
      (entries || []).forEach(function (entry) {
        if (!entry || entry.entry === "." || entry.entry === "..") return;
        items.push({
          name: entry.entry,
          kind: entry.type === "DIRECTORY" ? "dir" : "file",
          path: joinPath(path, entry.entry)
        });
      });
      return items;
    });
  }

  function validName(name) {
    return !!name && name.indexOf("/") < 0 && name.indexOf("\\") < 0 && name !== "." && name !== "..";
  }

  function createEntry(dir, name, kind) {
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
    if (!validName(name)) return Promise.reject(new Error("名称不合法"));
    var parent = parentOf(path);
    if (!parent) return Promise.reject(new Error("没有上级目录"));
    var dest = joinPath(parent, name);
    return Neutralino.filesystem.move(path, dest).then(function () { return dest; });
  }

  function removePath(path) {
    return Neutralino.filesystem.remove(path);
  }

  function resolvePath(base, rel) {
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

  return {
    inDesktop: inDesktop,
    inExtension: inExtension,
    ready: ready,
    onWindowClose: onWindowClose,
    invoke: invoke,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    baseName: baseName,
    normAbs: normAbs,
    readRange: readRange,
    lazyFile: lazyFile
  };
})();
