import base64
import os
import struct

pairs = []
for cp in range(0x80, 0x10000):
    ch = chr(cp)
    try:
        b = ch.encode("gbk")
    except Exception:
        continue
    if len(b) != 2:
        continue
    pairs.append((cp, (b[0] << 8) | b[1]))
pairs.sort()
blob = b"".join(struct.pack("<HH", cp, g) for cp, g in pairs)
b64 = base64.b64encode(blob).decode("ascii")
lines = [
    "/* Auto-generated GBK encode table: unicode BMP -> GBK uint16, sorted by code point. */",
    "var GBK_TABLE_B64 =",
]
for i in range(0, len(b64), 120):
    lines.append('  "' + b64[i : i + 120] + '" +')
lines[-1] = lines[-1][:-2] + ";"
lines.append("var GBK_COUNT = %d;" % len(pairs))
out = "\n".join(lines) + "\n"
path = os.path.join(os.path.dirname(__file__), "..", "js", "gbk.js")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(out)
print("pairs", len(pairs), "bytes", len(blob), "file", os.path.getsize(path))
