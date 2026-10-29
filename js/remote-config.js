/* global ND */
var ND = ND || {};

/* 换服务器时只改这里两处。路径前缀不要末尾斜杠。 */
ND.remote = {
  origin: "http://129.0.0.1",
  basePath: "/eda_agent/notepad_web",
  url: function (name) {
    var origin = String(this.origin || "").replace(/\/+$/, "");
    var base = String(this.basePath || "").replace(/\/+$/, "");
    if (base && base.charAt(0) !== "/") base = "/" + base;
    var leaf = String(name || "").replace(/^\/+/, "");
    return origin + base + "/" + leaf;
  }
};
