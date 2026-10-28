/* global GBK_TABLE_B64, GBK_COUNT */
var ND = ND || {};

(function () {
  "use strict";

  function pairs() {
    if (ND._gbk) return ND._gbk;
    var bin = atob(GBK_TABLE_B64);
    var n = (bin.length / 4) | 0;
    var cps = new Uint16Array(n);
    var gbs = new Uint16Array(n);
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      cps[i] = bin.charCodeAt(o) | (bin.charCodeAt(o + 1) << 8);
      gbs[i] = bin.charCodeAt(o + 2) | (bin.charCodeAt(o + 3) << 8);
    }
    ND._gbk = { cps: cps, gbs: gbs, n: n };
    return ND._gbk;
  }

  function lookup(cp) {
    var t = pairs();
    var lo = 0;
    var hi = t.n - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var v = t.cps[mid];
      if (v === cp) return t.gbs[mid];
      if (v < cp) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  function gbkEncode(str) {
    var out = [];
    var missing = [];
    for (var i = 0; i < str.length; i++) {
      var cu = str.charCodeAt(i);
      if (cu >= 0xd800 && cu <= 0xdbff) {
        missing.push(str.slice(i, i + 2));
        out.push(0x3f);
        i++;
        continue;
      }
      if (cu < 0x80) {
        out.push(cu);
        continue;
      }
      var g = lookup(cu);
      if (g < 0) {
        missing.push(str.charAt(i));
        out.push(0x3f);
      } else {
        out.push(g >> 8, g & 255);
      }
    }
    return { bytes: new Uint8Array(out), missing: missing };
  }

  function concat(chunks) {
    var n = 0;
    for (var i = 0; i < chunks.length; i++) n += chunks[i].length;
    var out = new Uint8Array(n);
    var o = 0;
    for (var j = 0; j < chunks.length; j++) {
      out.set(chunks[j], o);
      o += chunks[j].length;
    }
    return out;
  }

  function encodeText(text, encoding) {
    if (encoding === "utf-16le") {
      var body = new Uint8Array(text.length * 2);
      for (var i = 0; i < text.length; i++) {
        var c = text.charCodeAt(i);
        body[i * 2] = c & 255;
        body[i * 2 + 1] = c >> 8;
      }
      return { bytes: concat([new Uint8Array([0xff, 0xfe]), body]), missing: [] };
    }
    if (encoding === "utf-8-bom") {
      return { bytes: concat([new Uint8Array([0xef, 0xbb, 0xbf]), new TextEncoder().encode(text)]), missing: [] };
    }
    if (encoding === "gbk" || encoding === "gb18030") return gbkEncode(text);
    return { bytes: new TextEncoder().encode(text), missing: [] };
  }

  function decodeBytes(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8-bom", bom: true };
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le", bom: true };
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be", bom: true };
    }
    try {
      var text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return { text: text, encoding: "utf-8", bom: false };
    } catch (e) {
      return { text: new TextDecoder("gb18030").decode(bytes), encoding: "gbk", bom: false };
    }
  }

  function splitText(text) {
    var eol = "\n";
    if (text.indexOf("\r\n") >= 0) eol = "\r\n";
    else if (text.indexOf("\r") >= 0) eol = "\r";
    var norm = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var lines = norm.split("\n");
    if (!lines.length) lines = [""];
    return { eol: eol, lines: lines };
  }

  function joinEol(lines, eol) {
    return lines.join(eol || "\n");
  }

  function hexOf(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  }

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function sha256(bytes) {
    var K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    var H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    var ml = bytes.length;
    var bitHi = Math.floor((ml * 8) / 0x100000000);
    var bitLo = (ml * 8) >>> 0;
    var total = ((ml + 9 + 63) >> 6) << 6;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[ml] = 0x80;
    var view = new DataView(buf.buffer);
    view.setUint32(total - 8, bitHi);
    view.setUint32(total - 4, bitLo);
    var w = new Uint32Array(64);
    for (var i = 0; i < total; i += 64) {
      for (var t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4);
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var hex = "";
    for (var k = 0; k < 8; k++) hex += H[k].toString(16).padStart(8, "0");
    return hex;
  }

  function md5(bytes) {
    var s = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];
    var K = new Uint32Array(64);
    for (var i = 0; i < 64; i++) K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) >>> 0;
    var n = bytes.length;
    var total = (((n + 8) >> 6) + 1) << 6;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[n] = 0x80;
    var dv = new DataView(buf.buffer);
    var bits = n * 8;
    dv.setUint32(total - 8, bits >>> 0, true);
    dv.setUint32(total - 4, Math.floor(bits / 0x100000000), true);
    var a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
    var M = new Uint32Array(16);
    for (var off = 0; off < total; off += 64) {
      for (var j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
      var A = a, B = b, C = c, D = d;
      for (var r = 0; r < 64; r++) {
        var f, g;
        if (r < 16) { f = (B & C) | (~B & D); g = r; }
        else if (r < 32) { f = (D & B) | (~D & C); g = (5 * r + 1) % 16; }
        else if (r < 48) { f = B ^ C ^ D; g = (3 * r + 5) % 16; }
        else { f = C ^ (B | ~D); g = (7 * r) % 16; }
        var tmp = D;
        D = C;
        C = B;
        var sum = (A + f + K[r] + M[g]) >>> 0;
        B = (B + ((sum << s[r]) | (sum >>> (32 - s[r])))) >>> 0;
        A = tmp;
      }
      a = (a + A) >>> 0; b = (b + B) >>> 0; c = (c + C) >>> 0; d = (d + D) >>> 0;
    }
    function le(x) {
      return [x & 255, (x >>> 8) & 255, (x >>> 16) & 255, (x >>> 24) & 255]
        .map(function (v) { return v.toString(16).padStart(2, "0"); }).join("");
    }
    return le(a) + le(b) + le(c) + le(d);
  }

  function utf8Bytes(str) {
    return new TextEncoder().encode(str);
  }

  ND.codec = {
    gbkEncode: gbkEncode,
    encodeText: encodeText,
    decodeBytes: decodeBytes,
    splitText: splitText,
    joinEol: joinEol,
    sha256: sha256,
    md5: md5,
    hexOf: hexOf,
    utf8Bytes: utf8Bytes,
    count: typeof GBK_COUNT === "number" ? GBK_COUNT : 0
  };
})();
