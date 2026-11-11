var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "..");
var configPath = path.join(root, "js", "remote-config.js");
var manifestPath = path.join(root, "manifest.json");

function normalizeOrigin(value) {
  return String(value == null ? "" : value).trim().replace(/\/+$/, "");
}

function normalizeBasePath(value) {
  var base = String(value == null ? "" : value).trim().replace(/\/+$/, "");
  if (base && base.charAt(0) !== "/") base = "/" + base;
  return base;
}

function envOrigin() {
  return normalizeOrigin(process.env.NOTEPADWEB_REMOTE_ORIGIN || process.env.NOTEPADWEB_ORIGIN || "");
}

function envBasePath() {
  var raw = process.env.NOTEPADWEB_REMOTE_BASE_PATH || process.env.NOTEPADWEB_BASE_PATH;
  if (raw == null || String(raw).trim() === "") return null;
  return normalizeBasePath(raw);
}

function read() {
  var text = fs.readFileSync(configPath, "utf8");
  var origin = (text.match(/origin:\s*"([^"]*)"/) || [])[1];
  var basePath = (text.match(/basePath:\s*"([^"]*)"/) || [])[1];
  if (!origin) throw new Error("js/remote-config.js 缺少 origin");
  if (basePath == null) throw new Error("js/remote-config.js 缺少 basePath");
  return {
    origin: normalizeOrigin(origin),
    basePath: normalizeBasePath(basePath),
    url: function (name) {
      return this.origin + this.basePath + "/" + String(name || "").replace(/^\/+/, "");
    },
    hostPermission: function () {
      return this.origin + "/*";
    }
  };
}

function writeConfig(origin, basePath) {
  var text = fs.readFileSync(configPath, "utf8");
  if (!/origin:\s*"([^"]*)"/.test(text) || !/basePath:\s*"([^"]*)"/.test(text)) {
    throw new Error("js/remote-config.js 格式无法更新");
  }
  text = text.replace(/origin:\s*"[^"]*"/, 'origin: "' + origin.replace(/"/g, '\\"') + '"');
  text = text.replace(/basePath:\s*"[^"]*"/, 'basePath: "' + basePath.replace(/"/g, '\\"') + '"');
  fs.writeFileSync(configPath, text);
}

function applyEnvToConfig() {
  var cfg = read();
  var origin = envOrigin();
  var base = envBasePath();
  var changed = false;
  if (origin) {
    cfg.origin = origin;
    changed = true;
  }
  if (base != null) {
    cfg.basePath = base;
    changed = true;
  }
  if (changed) writeConfig(cfg.origin, cfg.basePath);
  return { cfg: cfg, changed: changed };
}

function applyManifest() {
  applyEnvToConfig();
  var cfg = read();
  var manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = [cfg.hostPermission()];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return cfg;
}

module.exports = {
  read: read,
  applyManifest: applyManifest,
  applyEnvToConfig: applyEnvToConfig,
  configPath: configPath
};

if (require.main === module) {
  var cfg = applyManifest();
  if (envOrigin() || envBasePath() != null) {
    console.log("已按环境变量写入 js/remote-config.js");
  }
  console.log("origin " + cfg.origin);
  console.log("basePath " + cfg.basePath);
  console.log("cat " + cfg.url("cat"));
  console.log("version " + cfg.url("version"));
  console.log("update.zip " + cfg.url("update.zip"));
  console.log("upload " + cfg.url("upload"));
  console.log("host_permissions " + cfg.hostPermission());
  console.log("已写入 manifest.json");
}
