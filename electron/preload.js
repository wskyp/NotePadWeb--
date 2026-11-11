"use strict";

var { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("notepadDesktop", {
  platform: process.platform,
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
