var fs = require("fs");
var path = require("path");
var https = require("https");
var http = require("http");
var { URL } = require("url");
var remoteConfig = require("./remote_config");

var root = path.resolve(__dirname, "..");
var outDir = path.resolve(root, "..", "NotePadWeb-release");
var zipPath = path.join(outDir, "NotePadWeb-chrome.zip");
var manifestPath = path.join(root, "manifest.json");
var remote = remoteConfig.read();
var uploadUrl = process.env.NOTEPADWEB_UPLOAD_URL || remote.url("upload");
var token = process.env.NOTEPADWEB_UPLOAD_TOKEN || "";
var notes = process.env.NOTEPADWEB_UPLOAD_NOTES || "";
var force = process.env.NOTEPADWEB_UPLOAD_FORCE === "1";

if (!fs.existsSync(zipPath)) {
  console.error("找不到 " + zipPath + "，请先执行 node tools/pack_chrome.js");
  process.exit(1);
}
if (!fs.existsSync(manifestPath)) {
  console.error("找不到 manifest.json");
  process.exit(1);
}

var version = JSON.parse(fs.readFileSync(manifestPath, "utf8")).version;
if (!version) {
  console.error("manifest.json 没有 version");
  process.exit(1);
}

var zip = fs.readFileSync(zipPath);
var boundary = "----NotePadWeb" + Date.now().toString(16);
var chunks = [];

function part(name, value, filename, type) {
  chunks.push(Buffer.from(
    "--" + boundary + "\r\n" +
    "Content-Disposition: form-data; name=\"" + name + "\"" +
    (filename ? "; filename=\"" + filename + "\"" : "") + "\r\n" +
    (type ? "Content-Type: " + type + "\r\n" : "") +
    "\r\n"
  ));
  chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"));
  chunks.push(Buffer.from("\r\n"));
}

part("version", version);
if (notes) part("notes", notes);
if (force) part("force", "1");
part("file", zip, "NotePadWeb-chrome.zip", "application/zip");
chunks.push(Buffer.from("--" + boundary + "--\r\n"));
var body = Buffer.concat(chunks);

var target = new URL(uploadUrl);
var transport = target.protocol === "https:" ? https : http;
var headers = {
  "Content-Type": "multipart/form-data; boundary=" + boundary,
  "Content-Length": body.length
};
if (token) headers["X-Upload-Token"] = token;

console.log("上传 " + zipPath);
console.log("版本 " + version);
console.log("地址 " + uploadUrl);

var req = transport.request({
  protocol: target.protocol,
  hostname: target.hostname,
  port: target.port || (target.protocol === "https:" ? 443 : 80),
  path: target.pathname + target.search,
  method: "POST",
  headers: headers
}, function (res) {
  var raw = [];
  res.on("data", function (chunk) { raw.push(chunk); });
  res.on("end", function () {
    var text = Buffer.concat(raw).toString("utf8");
    console.log("HTTP " + res.statusCode);
    console.log(text || "(空响应)");
    if (res.statusCode < 200 || res.statusCode >= 300) process.exit(1);
  });
});

req.on("error", function (err) {
  console.error("上传失败：" + (err && err.message ? err.message : err));
  process.exit(1);
});
req.write(body);
req.end();
