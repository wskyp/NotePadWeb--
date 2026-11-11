/* global ND */
var ND = ND || {};

ND.Zip = (function () {
  "use strict";

  var SKIP_NAME = /(?:^|\/)(?:__MACOSX\/|\.DS_Store|Thumbs\.db)(?:\/|$)/i;

  function u16(bytes, off) {
    return bytes[off] | (bytes[off + 1] << 8);
  }

  function u32(bytes, off) {
    return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
  }

  function isZip(bytes) {
    return !!(bytes && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
      (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08));
  }

  function isGzip(bytes) {
    return !!(bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
  }

  function decodeName(raw, utf8) {
    if (!raw || !raw.length) return "";
    if (utf8) return new TextDecoder("utf-8").decode(raw);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch (err) {
      try {
        return new TextDecoder("gb18030").decode(raw);
      } catch (err2) {
        return new TextDecoder("utf-8").decode(raw);
      }
    }
  }

  function findEOCD(bytes) {
    var min = Math.max(0, bytes.length - (65535 + 22));
    for (var i = bytes.length - 22; i >= min; i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
        return i;
      }
    }
    return -1;
  }

  function listZip(bytes) {
    var eocd = findEOCD(bytes);
    if (eocd < 0) throw new Error("不是有效的 ZIP 文件");
    var count = u16(bytes, eocd + 10);
    var size = u32(bytes, eocd + 12);
    var offset = u32(bytes, eocd + 16);
    if (offset + size > bytes.length) throw new Error("ZIP 目录损坏");
    var entries = [];
    var p = offset;
    var end = offset + size;
    for (var n = 0; n < count && p + 46 <= end; n++) {
      if (u32(bytes, p) !== 0x02014b50) break;
      var gp = u16(bytes, p + 8);
      var method = u16(bytes, p + 10);
      var compSize = u32(bytes, p + 20);
      var uncompSize = u32(bytes, p + 24);
      var nameLen = u16(bytes, p + 28);
      var extraLen = u16(bytes, p + 30);
      var commentLen = u16(bytes, p + 32);
      var localOffset = u32(bytes, p + 42);
      var nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
      var name = decodeName(nameBytes, !!(gp & 0x800));
      if (name && !/\/$/.test(name)) {
        entries.push({
          name: name.replace(/^\/+/, ""),
          method: method,
          compSize: compSize,
          uncompSize: uncompSize,
          localOffset: localOffset,
          encrypted: !!(gp & 1)
        });
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  function localData(bytes, entry) {
    var off = entry.localOffset;
    if (off + 30 > bytes.length || u32(bytes, off) !== 0x04034b50) {
      throw new Error("ZIP 本地头损坏：" + entry.name);
    }
    var nameLen = u16(bytes, off + 26);
    var extraLen = u16(bytes, off + 28);
    var start = off + 30 + nameLen + extraLen;
    var end = start + entry.compSize;
    if (end > bytes.length) throw new Error("ZIP 数据不完整：" + entry.name);
    return bytes.subarray(start, end);
  }

  function inflateStream(bytes, format) {
    if (typeof DecompressionStream === "undefined") {
      return Promise.reject(new Error("当前环境不支持解压（需要 DecompressionStream）"));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Response(stream).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  function extractZipEntry(bytes, entry) {
    if (entry.encrypted) return Promise.reject(new Error("不支持加密的压缩文件：" + entry.name));
    var data = localData(bytes, entry);
    if (entry.method === 0) return Promise.resolve(data.slice ? data.slice(0) : new Uint8Array(data));
    if (entry.method === 8) return inflateStream(data, "deflate-raw");
    return Promise.reject(new Error("不支持的 ZIP 压缩方式 " + entry.method + "：" + entry.name));
  }

  function baseName(path) {
    var s = String(path || "").replace(/\\/g, "/");
    var i = s.lastIndexOf("/");
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function usefulEntries(entries) {
    return (entries || []).filter(function (e) {
      if (!e || !e.name) return false;
      if (SKIP_NAME.test(e.name)) return false;
      return true;
    });
  }

  function looksText(bytes) {
    if (!bytes || !bytes.length) return true;
    var n = Math.min(bytes.length, 8192);
    var odd = 0;
    for (var i = 0; i < n; i++) {
      if (bytes[i] === 0) return false;
      if (bytes[i] < 9 || (bytes[i] > 13 && bytes[i] < 32)) odd++;
    }
    return odd / n <= 0.08;
  }

  function gunzip(bytes) {
    return inflateStream(bytes, "gzip");
  }

  function stripGzipName(name) {
    return String(name || "").replace(/\.gz$/i, "") || "unzipped.txt";
  }

  function tryUnwrapText(bytes, archiveName) {
    archiveName = archiveName || "";
    var lower = archiveName.toLowerCase();
    if (isGzip(bytes) || (/\.gz$/i.test(lower) && !/\.tar\.gz$/i.test(lower) && !/\.tgz$/i.test(lower))) {
      return gunzip(bytes).then(function (out) {
        if (!looksText(out)) return null;
        return {
          kind: "gzip",
          name: baseName(stripGzipName(archiveName)),
          bytes: out,
          entryCount: 1
        };
      }, function () { return null; });
    }
    if (!isZip(bytes) && !/\.zip$/i.test(lower)) return Promise.resolve(null);
    try {
      var entries = usefulEntries(listZip(bytes));
      if (entries.length !== 1) {
        return Promise.resolve({ kind: "zip", name: null, bytes: null, entryCount: entries.length, entries: entries });
      }
      return extractZipEntry(bytes, entries[0]).then(function (out) {
        if (!looksText(out)) {
          return { kind: "zip", name: null, bytes: null, entryCount: 1, binary: true, entryName: entries[0].name };
        }
        return {
          kind: "zip",
          name: baseName(entries[0].name) || entries[0].name,
          entryPath: entries[0].name,
          bytes: out,
          entryCount: 1
        };
      }, function () { return null; });
    } catch (err) {
      return Promise.resolve(null);
    }
  }

  return {
    isZip: isZip,
    isGzip: isGzip,
    listZip: listZip,
    extractZipEntry: extractZipEntry,
    gunzip: gunzip,
    tryUnwrapText: tryUnwrapText
  };
})();
