"use strict";

var fs = require("fs");
var path = require("path");
var { app, BrowserWindow, ipcMain, Menu } = require("electron");
var host = require("./host");

var mainWindow = null;
var closing = false;
var dataProfile = applyUserDataDir();

function argValue(names) {
  var argv = process.argv || [];
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    for (var n = 0; n < names.length; n++) {
      var key = names[n];
      if (a === key && argv[i + 1]) return argv[i + 1];
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

function applyUserDataDir() {
  // 必须在 ready 之前设置，localStorage / IndexedDB 才会进对应目录。
  var homeRoot = String(process.env.NOTEPADWEB_HOME || "").trim();
  var custom = argValue(["--data-dir", "--user-data-dir"]) ||
    process.env.NOTEPADWEB_DATA_DIR ||
    (homeRoot ? path.join(homeRoot, "data") : "") ||
    "";
  var instance = safeInstanceName(argValue(["--instance"]) || process.env.NOTEPADWEB_INSTANCE || "");
  var base = app.getPath("userData");
  var target = "";
  var label = "";

  if (custom) {
    target = path.resolve(custom);
    label = target;
  } else if (instance) {
    target = path.join(base, "instances", instance);
    label = "instance:" + instance;
  } else {
    return { dir: base, label: "default", instance: "" };
  }

  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (err) {
    console.error("无法创建数据目录 " + target + "：" + err);
  }
  app.setPath("userData", target);
  app.setPath("sessionData", target);
  return { dir: target, label: label, instance: instance };
}

function createWindow() {
  var title = "NotePadWeb--";
  if (dataProfile.instance) title += " [" + dataProfile.instance + "]";
  else if (dataProfile.label && dataProfile.label !== "default") title += " [" + path.basename(dataProfile.dir) + "]";

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: title,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.once("ready-to-show", function () {
    mainWindow.show();
  });

  mainWindow.on("close", function (e) {
    if (closing) return;
    e.preventDefault();
    mainWindow.webContents.send("desktop:close-request");
  });

  mainWindow.on("closed", function () {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
}

ipcMain.handle("desktop:invoke", function (event, cmd, args) {
  if (cmd === "app_exit") {
    closing = true;
    var win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.destroy();
    return true;
  }
  if (cmd === "data_dir") {
    return {
      dir: app.getPath("userData"),
      label: dataProfile.label,
      instance: dataProfile.instance || ""
    };
  }
  return host.handleInvoke(event, cmd, args);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", function () {
  app.quit();
});

app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
