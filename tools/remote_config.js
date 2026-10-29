var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "..");
var configPath = path.join(root, "js", "remote-config.js");
var manifestPath = path.join(root, "manifest.json");

function read() {
  var text = fs.readFileSync(configPath, "utf8");
  var origin = (text.match(/origin:\s*"([^"]*)"/) || [])[1];
  var basePath = (text.match(/basePath:\s*"([^"]*)"/) || [])[1];
  if (!origin) throw new Error("js/remote-config.js 缺少 origin");
  if (basePath == null) throw new Error("js/remote-config.js 缺少 basePath");
  basePath = String(basePath).replace(/\/+$/, "");
  if (basePath && basePath.charAt(0) !== "/") basePath = "/" + basePath;
  return {
    origin: String(origin).replace(/\/+$/, ""),
    basePath: basePath,
    url: function (name) {
      return this.origin + this.basePath + "/" + String(name || "").replace(/^\/+/, "");
    },
    hostPermission: function () {
      return this.origin + "/*";
    }
  };
}

function applyManifest() {
  var cfg = read();
  var manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = [cfg.hostPermission()];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return cfg;
}

module.exports = { read: read, applyManifest: applyManifest, configPath: configPath };

if (require.main === module) {
  var cfg = applyManifest();
  console.log("origin " + cfg.origin);
  console.log("basePath " + cfg.basePath);
  console.log("cat " + cfg.url("cat"));
  console.log("version " + cfg.url("version"));
  console.log("update.zip " + cfg.url("update.zip"));
  console.log("upload " + cfg.url("upload"));
  console.log("host_permissions " + cfg.hostPermission());
  console.log("已写入 manifest.json");
}
