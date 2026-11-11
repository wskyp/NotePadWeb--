"use strict";

var fs = require("fs");
var fsp = require("fs").promises;
var path = require("path");
var { dialog, BrowserWindow } = require("electron");

function onWindows() {
  return process.platform === "win32";
}

function sep() {
  return onWindows() ? "\\" : "/";
}

function baseName(p) {
  var s = String(p || "").replace(/\\/g, "/");
  var i = s.lastIndexOf("/");
  var name = i >= 0 ? s.slice(i + 1) : s;
  return name || s;
}

function parentOf(p) {
  return String(p || "").replace(/[\\/][^\\/]*$/, "");
}

function joinPath(dir, name) {
  var base = String(dir || "").replace(/[\\/]+$/, "");
  return base + sep() + name;
}

function emptyToNull(value) {
  if (value == null || value === "") return null;
  return value;
}

function winFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

async function pickFiles(event) {
  var win = winFromEvent(event);
  var res = await dialog.showOpenDialog(win || undefined, {
    title: "打开文件",
    properties: ["openFile", "multiSelections"]
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return null;
  return res.filePaths;
}

async function pickFolder(event) {
  var win = winFromEvent(event);
  var res = await dialog.showOpenDialog(win || undefined, {
    title: "打开文件夹",
    properties: ["openDirectory"]
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return null;
  return emptyToNull(res.filePaths[0]);
}

async function pickSave(event, suggested) {
  var win = winFromEvent(event);
  var res = await dialog.showSaveDialog(win || undefined, {
    title: "另存为",
    defaultPath: suggested || "untitled.txt"
  });
  if (res.canceled || !res.filePath) return null;
  return emptyToNull(res.filePath);
}

async function fileMeta(filePath) {
  var stats = await fsp.stat(filePath);
  return {
    name: baseName(filePath),
    size: stats.isDirectory() ? 0 : (stats.size || 0),
    isDir: !!stats.isDirectory(),
    mtime: stats.mtimeMs || 0
  };
}

function base64ToBuffer(b64) {
  return Buffer.from(String(b64 || ""), "base64");
}

function bufferToBase64(buf) {
  return Buffer.from(buf).toString("base64");
}

async function readFileRange(filePath, start, len) {
  if (!len || len <= 0) return "";
  var meta = await fileMeta(filePath);
  if (meta.isDir || start >= meta.size) return "";
  var take = Math.min(len, meta.size - start, 8 * 1024 * 1024);
  var fh = await fsp.open(filePath, "r");
  try {
    var buf = Buffer.alloc(take);
    var result = await fh.read(buf, 0, take, start);
    return bufferToBase64(buf.subarray(0, result.bytesRead));
  } finally {
    await fh.close();
  }
}

async function writeFile(filePath, data) {
  var bytes = base64ToBuffer(data);
  var parent = parentOf(filePath);
  var tmp = joinPath(parent || ".", "." + baseName(filePath) + ".notepadweb-tmp");
  if (parent) {
    try { await fsp.mkdir(parent, { recursive: true }); } catch (err) { /* exists */ }
  }
  await fsp.writeFile(tmp, bytes);
  try {
    await fsp.rename(tmp, filePath);
  } catch (err) {
    await fsp.writeFile(filePath, bytes);
    try { await fsp.unlink(tmp); } catch (e2) { /* ignore */ }
  }
}

function listLinkInfo(dir) {
  var map = Object.create(null);
  var names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    return map;
  }
  names.forEach(function (name) {
    if (name === "." || name === "..") return;
    var full = path.join(dir, name);
    try {
      var st = fs.lstatSync(full);
      if (st.isSymbolicLink()) {
        var target = "";
        try { target = fs.readlinkSync(full); } catch (e2) { target = ""; }
        map[name] = { kind: "symlink", target: String(target || "") };
      }
    } catch (err) { /* skip */ }
  });
  return map;
}

async function listDir(dirPath) {
  var entries = await fsp.readdir(dirPath, { withFileTypes: true });
  var links = listLinkInfo(dirPath);
  var seen = Object.create(null);
  var items = [];
  entries.forEach(function (entry) {
    var name = entry.name;
    if (!name || name === "." || name === "..") return;
    seen[name] = true;
    var full = path.join(dirPath, name);
    var link = links[name];
    items.push({
      name: name,
      kind: entry.isDirectory() ? "dir" : "file",
      path: full,
      mtime: 0,
      size: 0,
      link: !!link,
      linkTarget: (link && link.target) || "",
      broken: false
    });
  });
  Object.keys(links).forEach(function (name) {
    if (seen[name]) return;
    items.push({
      name: name,
      kind: "file",
      path: path.join(dirPath, name),
      mtime: 0,
      size: 0,
      link: true,
      linkTarget: links[name].target || "",
      broken: false
    });
  });
  return Promise.all(items.map(async function (item) {
    try {
      var stats = await fsp.stat(item.path);
      item.mtime = stats.mtimeMs || 0;
      item.size = stats.size || 0;
      item.kind = stats.isDirectory() ? "dir" : "file";
      item.broken = false;
      if (!item.link) {
        try {
          var lst = await fsp.lstat(item.path);
          if (lst.isSymbolicLink()) {
            item.link = true;
            try { item.linkTarget = await fsp.readlink(item.path); } catch (e2) { /* keep */ }
          }
        } catch (e3) { /* keep */ }
      }
      return item;
    } catch (err) {
      item.broken = !!item.link;
      return item;
    }
  }));
}

function validName(name) {
  return !!name && name.indexOf("/") < 0 && name.indexOf("\\") < 0 && name !== "." && name !== "..";
}

async function createEntry(dir, name, kind) {
  if (!validName(name)) throw new Error("名称不合法");
  var full = joinPath(dir, name);
  var exists = false;
  try {
    await fsp.access(full);
    exists = true;
  } catch (err) {
    exists = false;
  }
  if (exists) throw new Error("已存在同名项目");
  if (kind === "dir") {
    await fsp.mkdir(full);
    return full;
  }
  await fsp.writeFile(full, Buffer.alloc(0));
  return full;
}

async function renamePath(filePath, name) {
  if (!validName(name)) throw new Error("名称不合法");
  var parent = parentOf(filePath);
  if (!parent) throw new Error("没有上级目录");
  var dest = joinPath(parent, name);
  await fsp.rename(filePath, dest);
  return dest;
}

async function removePath(filePath) {
  await fsp.rm(filePath, { recursive: true, force: true });
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

async function handleInvoke(event, cmd, args) {
  args = args || {};
  if (cmd === "pick_files") return pickFiles(event);
  if (cmd === "pick_folder") return pickFolder(event);
  if (cmd === "pick_save") return pickSave(event, args.suggested);
  if (cmd === "file_meta") return fileMeta(args.path);
  if (cmd === "read_file_range") return readFileRange(args.path, args.start || 0, args.len || 0);
  if (cmd === "write_file") return writeFile(args.path, args.data || "");
  if (cmd === "list_dir") return listDir(args.path);
  if (cmd === "create_entry") return createEntry(args.dir, args.name, args.kind);
  if (cmd === "rename_path") return renamePath(args.path, args.name);
  if (cmd === "remove_path") return removePath(args.path);
  if (cmd === "resolve_path") return resolvePath(args.base, args.rel);
  if (cmd === "app_exit") {
    var win = winFromEvent(event);
    if (win) win.destroy();
    return true;
  }
  throw new Error("未知命令 " + cmd);
}

module.exports = { handleInvoke };
