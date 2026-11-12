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

  /* ---- pure-JS inflate (deflate-raw + gzip)，供无 DecompressionStream 的 WebKit 使用 ---- */

  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  var FIXED_LIT;
  var FIXED_DIST;

  function buildHuffman(lengths) {
    var max = 0;
    var i;
    for (i = 0; i < lengths.length; i++) if (lengths[i] > max) max = lengths[i];
    var counts = new Uint16Array(max + 1);
    for (i = 0; i < lengths.length; i++) if (lengths[i]) counts[lengths[i]]++;
    var next = new Uint16Array(max + 1);
    var code = 0;
    counts[0] = 0;
    for (i = 1; i <= max; i++) {
      code = (code + counts[i - 1]) << 1;
      next[i] = code;
    }
    var table = new Int32Array(1 << max);
    for (i = 0; i < table.length; i++) table[i] = -1;
    for (i = 0; i < lengths.length; i++) {
      var len = lengths[i];
      if (!len) continue;
      var c = next[len]++;
      var rev = 0;
      var v = c;
      var b;
      for (b = 0; b < len; b++) {
        rev = (rev << 1) | (v & 1);
        v >>= 1;
      }
      var step = 1 << len;
      for (var fill = rev; fill < table.length; fill += step) {
        table[fill] = (len << 16) | i;
      }
    }
    return { table: table, bits: max };
  }

  function ensureFixedTrees() {
    if (FIXED_LIT) return;
    var lit = new Uint8Array(288);
    var i;
    for (i = 0; i <= 143; i++) lit[i] = 8;
    for (i = 144; i <= 255; i++) lit[i] = 9;
    for (i = 256; i <= 279; i++) lit[i] = 7;
    for (i = 280; i <= 287; i++) lit[i] = 8;
    var dist = new Uint8Array(32);
    for (i = 0; i < 32; i++) dist[i] = 5;
    FIXED_LIT = buildHuffman(lit);
    FIXED_DIST = buildHuffman(dist);
  }

  function inflateRaw(src) {
    ensureFixedTrees();
    var pos = 0;
    var bitBuf = 0;
    var bitLen = 0;
    var outCap = Math.max(256, Math.min(src.length * 4, 1024 * 1024));
    var out = new Uint8Array(outCap);
    var outLen = 0;

    function bits(n) {
      while (bitLen < n) {
        if (pos >= src.length) throw new Error("压缩数据不完整");
        bitBuf |= src[pos++] << bitLen;
        bitLen += 8;
      }
      var v = bitBuf & ((1 << n) - 1);
      bitBuf >>>= n;
      bitLen -= n;
      return v;
    }

    function decode(tree) {
      while (bitLen < tree.bits) {
        if (pos >= src.length) throw new Error("压缩数据不完整");
        bitBuf |= src[pos++] << bitLen;
        bitLen += 8;
      }
      var entry = tree.table[bitBuf & ((1 << tree.bits) - 1)];
      if (entry < 0) throw new Error("Huffman 解码失败");
      var len = entry >>> 16;
      bitBuf >>>= len;
      bitLen -= len;
      return entry & 0xffff;
    }

    function ensure(n) {
      if (outLen + n <= outCap) return;
      var next = outCap;
      while (outLen + n > next) next *= 2;
      var grown = new Uint8Array(next);
      grown.set(out.subarray(0, outLen));
      out = grown;
      outCap = next;
    }

    function pushByte(b) {
      ensure(1);
      out[outLen++] = b;
    }

    function copyMatch(len, dist) {
      var from = outLen - dist;
      if (from < 0) throw new Error("回看距离无效");
      ensure(len);
      for (var i = 0; i < len; i++) out[outLen++] = out[from + i];
    }

    function inflateBlock(litTree, distTree) {
      for (;;) {
        var sym = decode(litTree);
        if (sym < 256) {
          pushByte(sym);
        } else if (sym === 256) {
          break;
        } else {
          var li = sym - 257;
          if (li >= LEN_BASE.length) throw new Error("非法长度符号");
          var length = LEN_BASE[li] + (LEN_EXTRA[li] ? bits(LEN_EXTRA[li]) : 0);
          var di = decode(distTree);
          if (di >= DIST_BASE.length) throw new Error("非法距离符号");
          var distance = DIST_BASE[di] + (DIST_EXTRA[di] ? bits(DIST_EXTRA[di]) : 0);
          copyMatch(length, distance);
        }
      }
    }

    function readCodeLengths(count, clTree) {
      var lengths = new Uint8Array(count);
      var i = 0;
      while (i < count) {
        var sym = decode(clTree);
        if (sym < 16) {
          lengths[i++] = sym;
        } else if (sym === 16) {
          if (!i) throw new Error("码长表损坏");
          var rep = 3 + bits(2);
          var prev = lengths[i - 1];
          while (rep-- && i < count) lengths[i++] = prev;
        } else if (sym === 17) {
          var z17 = 3 + bits(3);
          while (z17-- && i < count) lengths[i++] = 0;
        } else if (sym === 18) {
          var z18 = 11 + bits(7);
          while (z18-- && i < count) lengths[i++] = 0;
        } else {
          throw new Error("码长符号无效");
        }
      }
      return lengths;
    }

    for (;;) {
      var bfinal = bits(1);
      var btype = bits(2);
      if (btype === 0) {
        bitBuf = 0;
        bitLen = 0;
        if (pos + 4 > src.length) throw new Error("存储块损坏");
        var len = src[pos] | (src[pos + 1] << 8);
        var nlen = src[pos + 2] | (src[pos + 3] << 8);
        pos += 4;
        if ((len ^ 0xffff) !== nlen) throw new Error("存储块长度校验失败");
        if (pos + len > src.length) throw new Error("存储块数据不足");
        for (var s = 0; s < len; s++) pushByte(src[pos++]);
      } else if (btype === 1) {
        inflateBlock(FIXED_LIT, FIXED_DIST);
      } else if (btype === 2) {
        var hlit = bits(5) + 257;
        var hdist = bits(5) + 1;
        var hclen = bits(4) + 4;
        var clLens = new Uint8Array(19);
        for (var c = 0; c < hclen; c++) clLens[CL_ORDER[c]] = bits(3);
        var clTree = buildHuffman(clLens);
        var all = readCodeLengths(hlit + hdist, clTree);
        var litTree = buildHuffman(all.subarray(0, hlit));
        var distTree = buildHuffman(all.subarray(hlit));
        inflateBlock(litTree, distTree);
      } else {
        throw new Error("未知的 deflate 块类型");
      }
      if (bfinal) break;
    }
    return out.slice(0, outLen);
  }

  function skipGzipHeader(bytes) {
    if (!isGzip(bytes) || bytes.length < 10) throw new Error("不是有效的 gzip");
    if (bytes[2] !== 8) throw new Error("不支持的 gzip 压缩方法");
    var flg = bytes[3];
    var pos = 10;
    if (flg & 4) {
      if (pos + 2 > bytes.length) throw new Error("gzip 额外字段损坏");
      var xlen = bytes[pos] | (bytes[pos + 1] << 8);
      pos += 2 + xlen;
    }
    if (flg & 8) {
      while (pos < bytes.length && bytes[pos++]) { /* FNAME */ }
    }
    if (flg & 16) {
      while (pos < bytes.length && bytes[pos++]) { /* FCOMMENT */ }
    }
    if (flg & 2) pos += 2; /* FHCRC */
    if (pos >= bytes.length) throw new Error("gzip 头不完整");
    return pos;
  }

  function inflateJs(bytes, format) {
    if (format === "gzip") {
      var start = skipGzipHeader(bytes);
      var end = bytes.length >= 8 ? bytes.length - 8 : bytes.length;
      if (end < start) throw new Error("gzip 数据过短");
      return inflateRaw(bytes.subarray(start, end));
    }
    if (format === "deflate-raw") return inflateRaw(bytes);
    if (format === "deflate") {
      if (bytes.length < 2) throw new Error("zlib 数据过短");
      var cmf = bytes[0];
      if ((cmf & 0x0f) !== 8) throw new Error("不支持的 zlib 压缩方法");
      var hasDict = !!(bytes[1] & 0x20);
      var off = hasDict ? 6 : 2;
      var zend = bytes.length >= 4 ? bytes.length - 4 : bytes.length;
      if (zend < off) throw new Error("zlib 数据过短");
      return inflateRaw(bytes.subarray(off, zend));
    }
    throw new Error("不支持的解压格式：" + format);
  }

  function inflateStream(bytes, format) {
    if (typeof DecompressionStream !== "undefined") {
      try {
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
        return new Response(stream).arrayBuffer().then(function (buf) {
          return new Uint8Array(buf);
        }, function () {
          return inflateJs(bytes, format);
        });
      } catch (err) {
        /* fall through to JS */
      }
    }
    return Promise.resolve().then(function () {
      return inflateJs(bytes, format);
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
        if (!looksText(out)) {
          return { kind: "gzip", name: null, bytes: null, entryCount: 1, binary: true };
        }
        return {
          kind: "gzip",
          name: baseName(stripGzipName(archiveName)),
          bytes: out,
          entryCount: 1
        };
      }, function (err) {
        return { kind: "gzip", name: null, bytes: null, entryCount: 1, error: (err && err.message) || "解压失败" };
      });
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
