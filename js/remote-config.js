/* global ND */
var ND = ND || {};

/* 默认远程地址。换服务器可改这里，或用环境变量覆盖（桌面端运行时 / 打包时均可）。
 * NOTEPADWEB_REMOTE_ORIGIN / NOTEPADWEB_ORIGIN
 * NOTEPADWEB_REMOTE_BASE_PATH / NOTEPADWEB_BASE_PATH
 * 路径前缀不要末尾斜杠。
 */
ND.remote = {
  origin: "http://dmas-uat.hisi.huawei.com",
  basePath: "/eda_agent/notepad_web",
  url: function (name) {
    var origin = String(this.origin || "").replace(/\/+$/, "");
    var base = String(this.basePath || "").replace(/\/+$/, "");
    if (base && base.charAt(0) !== "/") base = "/" + base;
    var leaf = String(name || "").replace(/^\/+/, "");
    return origin + base + "/" + leaf;
  },
  normalizeOrigin: function (value) {
    return String(value == null ? "" : value).trim().replace(/\/+$/, "");
  },
  normalizeBasePath: function (value) {
    var base = String(value == null ? "" : value).trim().replace(/\/+$/, "");
    if (base && base.charAt(0) !== "/") base = "/" + base;
    return base;
  },
  applyEnv: function (env) {
    env = env || {};
    var origin = env.NOTEPADWEB_REMOTE_ORIGIN || env.NOTEPADWEB_ORIGIN || "";
    var base = env.NOTEPADWEB_REMOTE_BASE_PATH || env.NOTEPADWEB_BASE_PATH;
    if (origin) this.origin = this.normalizeOrigin(origin);
    if (base != null && String(base).trim() !== "") this.basePath = this.normalizeBasePath(base);
    return this;
  }
};
