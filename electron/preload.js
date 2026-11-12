"use strict";

var { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("notepadDesktop", {
  platform: process.platform,
  env: {
    NOTEPADWEB_REMOTE_ORIGIN: process.env.NOTEPADWEB_REMOTE_ORIGIN || process.env.NOTEPADWEB_ORIGIN || "",
    NOTEPADWEB_ORIGIN: process.env.NOTEPADWEB_ORIGIN || process.env.NOTEPADWEB_REMOTE_ORIGIN || "",
    NOTEPADWEB_REMOTE_BASE_PATH: process.env.NOTEPADWEB_REMOTE_BASE_PATH || process.env.NOTEPADWEB_BASE_PATH || "",
    NOTEPADWEB_BASE_PATH: process.env.NOTEPADWEB_BASE_PATH || process.env.NOTEPADWEB_REMOTE_BASE_PATH || "",
    NOTEPADWEB_DATA_DIR: process.env.NOTEPADWEB_DATA_DIR || "",
    NOTEPADWEB_HOME: process.env.NOTEPADWEB_HOME || "",
    NOTEPADWEB_CACHE_DIR: process.env.NOTEPADWEB_CACHE_DIR || "",
    NOTEPADWEB_INSTANCE: process.env.NOTEPADWEB_INSTANCE || ""
  },
  invoke: function (cmd, args) {
    return ipcRenderer.invoke("desktop:invoke", cmd, args || {});
  },
  dataDir: function () {
    return ipcRenderer.invoke("desktop:invoke", "data_dir", {});
  },
  onCloseRequest: function (handler) {
    ipcRenderer.removeAllListeners("desktop:close-request");
    ipcRenderer.on("desktop:close-request", function () {
      Promise.resolve()
        .then(function () { return handler ? handler() : true; })
        .then(function (ok) {
          if (ok) return ipcRenderer.invoke("desktop:invoke", "app_exit", {});
        })
        .catch(function () {});
    });
  }
});
