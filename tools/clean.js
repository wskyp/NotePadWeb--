var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "..");
var dirs = ["resources", "bin", "dist", ".tmp", ".storage", "icons", "extensions"];
var files = ["js/neutralino.js", "js/neutralino.d.ts"];

dirs.forEach(function (name) {
  fs.rmSync(path.join(root, name), { recursive: true, force: true });
});
files.forEach(function (name) {
  fs.rmSync(path.join(root, name), { force: true });
});
console.log("已清掉打包中间文件");
