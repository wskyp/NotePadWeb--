var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "..");
var dest = path.join(root, "resources");

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(function (name) {
    var src = path.join(from, name);
    var target = path.join(to, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, target);
    else copyFile(src, target);
  });
}

fs.rmSync(dest, { recursive: true, force: true });
copyFile(path.join(root, "index.html"), path.join(dest, "index.html"));
copyDir(path.join(root, "css"), path.join(dest, "css"));
copyDir(path.join(root, "js"), path.join(dest, "js"));
console.log("staged frontend at resources/");
