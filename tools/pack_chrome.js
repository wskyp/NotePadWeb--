var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var child = require("child_process");
var remoteConfig = require("./remote_config");

var root = path.resolve(__dirname, "..");
var outDir = path.resolve(root, "..", "NotePadWeb-release");
var stage = path.join(outDir, "NotePadWeb-chrome");
var pemPath = path.join(outDir, "NotePadWeb-chrome.pem");
var crxPath = path.join(outDir, "NotePadWeb-chrome.crx");
var zipPath = path.join(outDir, "NotePadWeb-chrome.zip");

var remote = remoteConfig.applyManifest();
console.log("远程配置 " + remote.origin + remote.basePath);

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(function (name) {
    var src = path.join(from, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, path.join(to, name));
    else copyFile(src, path.join(to, name));
  });
}

function varint(n) {
  var bytes = [];
  var v = n >>> 0;
  while (v > 127) {
    bytes.push((v & 127) | 128);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

function protoBytes(field, data) {
  var tag = (field << 3) | 2;
  return Buffer.concat([varint(tag), varint(data.length), data]);
}

function loadKey() {
  if (fs.existsSync(pemPath)) return crypto.createPrivateKey(fs.readFileSync(pemPath));
  var pair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  fs.writeFileSync(pemPath, pair.privateKey.export({ type: "pkcs8", format: "pem" }));
  return pair.privateKey;
}

function extensionId(publicKey) {
  var hex = crypto.createHash("sha256").update(publicKey).digest().subarray(0, 16).toString("hex");
  var alphabet = "abcdefghijklmnop";
  var id = "";
  for (var i = 0; i < hex.length; i++) id += alphabet[parseInt(hex.charAt(i), 16)];
  return id;
}

function packCrx(zip) {
  var privateKey = loadKey();
  var publicKey = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" });
  var crxId = crypto.createHash("sha256").update(publicKey).digest().subarray(0, 16);
  var signedHeader = protoBytes(1, crxId);
  var size = Buffer.alloc(4);
  size.writeUInt32LE(signedHeader.length, 0);
  var signature = crypto.sign("sha256", Buffer.concat([
    Buffer.from("CRX3 SignedData\0", "binary"),
    size,
    signedHeader,
    zip
  ]), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
  });
  var proof = Buffer.concat([protoBytes(1, publicKey), protoBytes(2, signature)]);
  var header = Buffer.concat([protoBytes(10000, signedHeader), protoBytes(2, proof)]);
  var headerSize = Buffer.alloc(4);
  headerSize.writeUInt32LE(header.length, 0);
  var version = Buffer.alloc(4);
  version.writeUInt32LE(3, 0);
  fs.writeFileSync(crxPath, Buffer.concat([
    Buffer.from("Cr24"),
    version,
    headerSize,
    header,
    zip
  ]));
  return extensionId(publicKey);
}

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
copyFile(path.join(root, "manifest.json"), path.join(stage, "manifest.json"));
copyFile(path.join(root, "index.html"), path.join(stage, "index.html"));
copyDir(path.join(root, "css"), path.join(stage, "css"));
copyDir(path.join(root, "js"), path.join(stage, "js"));
copyDir(path.join(root, "ext"), path.join(stage, "ext"));

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
child.execFileSync("tar", ["-a", "-cf", zipPath, "-C", stage, "manifest.json", "index.html", "css", "js", "ext"], { stdio: "inherit" });

var id = packCrx(fs.readFileSync(zipPath));
console.log("Chrome 扩展目录 " + stage);
console.log("Chrome 扩展压缩包 " + zipPath);
console.log("Chrome 扩展安装包 " + crxPath);
console.log("扩展 ID " + id);
console.log("私钥 " + pemPath);
