var fs = require("fs");
var path = require("path");
var child = require("child_process");

var root = path.resolve(__dirname, "..");
var outDir = path.resolve(root, "..", "NotePadWeb-release");
var stage = path.join(outDir, ".build", "NotePadWeb");
var resources = path.join(stage, "resources.neu");

function zipFiles(dir, names, destZip) {
  var list = names.map(function (name) { return path.join(dir, name); }).filter(fs.existsSync);
  if (!list.length) throw new Error("没有可打包的文件");
  fs.mkdirSync(path.dirname(destZip), { recursive: true });
  if (fs.existsSync(destZip)) fs.rmSync(destZip);
  var args = list.map(function (file) { return "'" + file.replace(/'/g, "''") + "'"; }).join(",");
  child.execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    "Compress-Archive -Path " + args + " -DestinationPath '" + destZip.replace(/'/g, "''") + "'"
  ], { stdio: "inherit" });
}

if (!fs.existsSync(resources)) {
  console.error("找不到 resources.neu，请先完成 neu build");
  process.exit(1);
}

var winNames = fs.readdirSync(stage).filter(function (name) {
  return name === "resources.neu" || /-win_/.test(name) || /\.dll$/i.test(name);
});
zipFiles(stage, winNames, path.join(outDir, "NotePadWeb-windows.zip"));
console.log("Windows 包 " + path.join(outDir, "NotePadWeb-windows.zip"));

var linuxName = "NotePadWeb-linux_x64";
if (!fs.existsSync(path.join(stage, linuxName))) {
  console.error("找不到 " + linuxName);
  process.exit(1);
}
zipFiles(stage, [linuxName, "resources.neu"], path.join(outDir, "NotePadWeb-linux.zip"));
console.log("Linux 包 " + path.join(outDir, "NotePadWeb-linux.zip"));

fs.rmSync(path.join(outDir, ".build"), { recursive: true, force: true });
