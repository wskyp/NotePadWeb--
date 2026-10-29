#!/bin/bash
# 把已经 neu build 出来的 Linux 程序收成可拷贝的目录。
# libpng16 和 libstdc++ 放在程序旁边的 lib/，不依赖某一台机器上的 /opt 或 /usr/local。
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
stage="${STAGE:-$(cd "$root/.." && pwd)/NotePadWeb-release/.build/NotePadWeb}"
out="${OUT:-$(cd "$root/.." && pwd)/NotePadWeb-release/NotePadWeb-linux}"
vendored="$root/tools/centos7-libs"

if [ ! -f "$stage/NotePadWeb-linux_x64" ] || [ ! -f "$stage/resources.neu" ]; then
  echo "找不到 $stage 里的运行时或 resources.neu" >&2
  exit 1
fi

rm -rf "$out"
mkdir -p "$out/lib"
cp -a "$stage/NotePadWeb-linux_x64" "$out/NotePadWeb-linux_x64"
cp -a "$stage/resources.neu" "$out/resources.neu"

copy_lib() {
  local name="$1"
  local fallback="$2"
  if [ -f "$vendored/$name" ]; then
    cp -L "$vendored/$name" "$out/lib/$name"
  elif [ -n "$fallback" ] && [ -e "$fallback" ]; then
    cp -L "$fallback" "$out/lib/$name"
  else
    echo "缺少 $name" >&2
    exit 1
  fi
}

copy_lib libpng16.so.16 "${PNG16:-$root/.local/lib/libpng16.so.16}"
copy_lib libstdc++.so.6 "${STDCPP:-/opt/gcc-9.3/lib64/libstdc++.so.6}"
copy_lib libgcc_s.so.1 "${LIBGCC:-/opt/gcc-9.3/lib64/libgcc_s.so.1}"
chmod 755 "$out/NotePadWeb-linux_x64" "$out/lib/"*

if command -v patchelf >/dev/null 2>&1; then
  patchelf --remove-rpath "$out/lib/libpng16.so.16" 2>/dev/null || true
  patchelf --remove-rpath "$out/lib/libgcc_s.so.1" 2>/dev/null || true
  patchelf --remove-rpath "$out/lib/libstdc++.so.6" 2>/dev/null || true
  patchelf --set-rpath '$ORIGIN' "$out/lib/libstdc++.so.6"
  patchelf --set-rpath '$ORIGIN/lib' "$out/NotePadWeb-linux_x64"
fi

cat > "$out/NotePadWeb.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
export LD_LIBRARY_PATH="$PWD/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export GDK_GL=disable
if [ ! -e /usr/lib64/libgtk-3.so.0 ] && [ ! -e /usr/lib/x86_64-linux-gnu/libgtk-3.so.0 ]; then
  echo "缺少 GTK3。CentOS 7 可执行: sudo yum install gtk3"
fi
if [ ! -e /usr/lib64/libwebkit2gtk-4.0.so.37 ] && [ ! -e /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.0.so.37 ] && [ ! -e /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so.0 ]; then
  echo "缺少 WebKitGTK。CentOS 7 可执行: sudo yum install epel-release webkitgtk4"
fi
chmod +x "$PWD/NotePadWeb-linux_x64" 2>/dev/null || true
exec "$PWD/NotePadWeb-linux_x64" "$@"
EOF
chmod 755 "$out/NotePadWeb.sh"

tar -C "$(dirname "$out")" -czf "$(dirname "$out")/NotePadWeb-linux.tar.gz" "$(basename "$out")"
echo "已生成 $out"
echo "压缩包 $(dirname "$out")/NotePadWeb-linux.tar.gz"
