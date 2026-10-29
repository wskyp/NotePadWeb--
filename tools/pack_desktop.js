var fs = require("fs");
var path = require("path");
var child = require("child_process");

var root = path.resolve(__dirname, "..");
var outDir = path.resolve(root, "..", "NotePadWeb-release");
var stage = path.join(outDir, ".build", "NotePadWeb");
var resources = path.join(stage, "resources.neu");

if (process.argv.indexOf("--bundle-only") >= 0) {
  var existing = path.join(outDir, "NotePadWeb-linux");
  fs.writeFileSync(path.join(existing, "NotePadWeb.sh"), linuxLauncherScript());
  var made = writeLinuxExecutable(existing, path.join(outDir, "NotePadWeb"));
  console.log("Linux 可执行文件 " + made);
  process.exit(0);
}

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
var bundledLibs = ["libpng16.so.16", "libstdc++.so.6", "libgcc_s.so.1"];
var libSrc = path.join(root, "tools", "centos7-libs");
bundledLibs.forEach(function (name) {
  if (!fs.existsSync(path.join(libSrc, name))) {
    console.error("缺少 tools/centos7-libs/" + name);
    process.exit(1);
  }
});
var linuxDir = path.join(outDir, "NotePadWeb-linux");
fs.rmSync(linuxDir, { recursive: true, force: true });
fs.mkdirSync(path.join(linuxDir, "lib"), { recursive: true });
fs.copyFileSync(path.join(stage, linuxName), path.join(linuxDir, linuxName));
fs.copyFileSync(resources, path.join(linuxDir, "resources.neu"));
bundledLibs.forEach(function (name) {
  fs.copyFileSync(path.join(libSrc, name), path.join(linuxDir, "lib", name));
});
fs.writeFileSync(path.join(linuxDir, "NotePadWeb.sh"), linuxLauncherScript());
if (process.platform === "linux") {
  try {
    child.execFileSync("patchelf", ["--set-rpath", "$ORIGIN/lib", path.join(linuxDir, linuxName)], { stdio: "inherit" });
  } catch (err) {
    console.log("未能写入 RPATH，请用 NotePadWeb.sh 启动");
  }
}
fs.mkdirSync(outDir, { recursive: true });
var linuxZip = path.join(outDir, "NotePadWeb-linux.zip");
if (fs.existsSync(linuxZip)) fs.rmSync(linuxZip);
if (process.platform === "win32") {
  child.execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    "Compress-Archive -Path '" + linuxDir.replace(/'/g, "''") + "' -DestinationPath '" + linuxZip.replace(/'/g, "''") + "'"
  ], { stdio: "inherit" });
} else {
  child.execFileSync("tar", ["-czf", path.join(outDir, "NotePadWeb-linux.tar.gz"), "-C", outDir, "NotePadWeb-linux"], { stdio: "inherit" });
}
var executable = writeLinuxExecutable(linuxDir, path.join(outDir, "NotePadWeb"));
console.log("Linux 包 " + linuxDir);
console.log("Linux 可执行文件 " + executable);

fs.rmSync(path.join(outDir, ".build"), { recursive: true, force: true });

function linuxLauncherScript() {
  return [
    "#!/bin/bash",
    "cd \"$(dirname \"$0\")\"",
    "export LD_LIBRARY_PATH=\"$PWD/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}\"",
    "export WEBKIT_DISABLE_COMPOSITING_MODE=1",
    "export WEBKIT_DISABLE_DMABUF_RENDERER=1",
    "export GDK_GL=disable",
    "if [ ! -e /usr/lib64/libgtk-3.so.0 ] && [ ! -e /usr/lib/x86_64-linux-gnu/libgtk-3.so.0 ]; then",
    "  echo \"缺少 GTK3。CentOS 7 可执行: sudo yum install gtk3\"",
    "fi",
    "if [ ! -e /usr/lib64/libwebkit2gtk-4.0.so.37 ] && [ ! -e /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.0.so.37 ] && [ ! -e /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so.0 ]; then",
    "  echo \"缺少 WebKitGTK。CentOS 7 可执行: sudo yum install epel-release webkitgtk4\"",
    "fi",
    "chmod +x \"$PWD/NotePadWeb-linux_x64\" 2>/dev/null || true",
    "exec \"$PWD/NotePadWeb-linux_x64\" \"$@\"",
    ""
  ].join("\n");
}

function writeLinuxExecutable(linuxDir, dest) {
  var crypto = require("crypto");
  var tarPath = dest + ".payload.tar.gz";
  child.execFileSync("tar", ["-czf", tarPath, "-C", linuxDir, "."], { stdio: "inherit" });
  var payload = fs.readFileSync(tarPath);
  fs.rmSync(tarPath, { force: true });
  var stamp = crypto.createHash("sha256").update(payload).digest("hex").slice(0, 12);
  var offsetToken = "0000000000";
  var script = [
    "#!/bin/bash",
    "set -euo pipefail",
    "stamp=\"" + stamp + "\"",
    "base=\"${XDG_CACHE_HOME:-$HOME/.cache}/notepadweb/$stamp\"",
    "if [ ! -x \"$base/NotePadWeb-linux_x64\" ]; then",
    "  mkdir -p \"$base\"",
    "  tail -c +" + offsetToken + " \"$0\" | tar -xzf - -C \"$base\"",
    "  chmod 755 \"$base/NotePadWeb-linux_x64\"",
    "  chmod 755 \"$base/lib/\"* 2>/dev/null || true",
    "fi",
    "cd \"$base\"",
    "export LD_LIBRARY_PATH=\"$base/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}\"",
    "export WEBKIT_DISABLE_COMPOSITING_MODE=1",
    "export WEBKIT_DISABLE_DMABUF_RENDERER=1",
    "export GDK_GL=disable",
    "if [ -z \"${DISPLAY:-}\" ] && [ -z \"${WAYLAND_DISPLAY:-}\" ]; then",
    "  echo \"没有可用的图形界面。请在桌面会话里运行，或先设置 DISPLAY。\"",
    "  exit 1",
    "fi",
    "exec \"$base/NotePadWeb-linux_x64\" \"$@\"",
    ""
  ].join("\n");
  var header = Buffer.from(script, "utf8");
  var offset = String(header.length + 1).padStart(10, "0");
  if (offset.length !== offsetToken.length) throw new Error("payload offset width");
  header = Buffer.from(header.toString("utf8").replace(offsetToken, offset), "utf8");
  fs.writeFileSync(dest, Buffer.concat([header, payload]));
  return dest;
}
