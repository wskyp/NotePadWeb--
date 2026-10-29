var fs = require("fs");
var path = require("path");
var zlib = require("zlib");

function crc32(buf) {
  var table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  var crc = 0xffffffff;
  for (var i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  var len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  var body = Buffer.concat([Buffer.from(type), data]);
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  var raw = Buffer.alloc((size * 4 + 1) * size);
  var margin = Math.max(2, Math.round(size * 0.12));
  for (var y = 0; y < size; y++) {
    var row = y * (size * 4 + 1);
    raw[row] = 0;
    for (var x = 0; x < size; x++) {
      var i = row + 1 + x * 4;
      var page = x >= margin && y >= margin && x < size - margin && y < size - margin;
      var line = page && x < size - margin * 2 && (
        (y >= Math.round(size * 0.30) && y < Math.round(size * 0.36)) ||
        (y >= Math.round(size * 0.48) && y < Math.round(size * 0.54)) ||
        (y >= Math.round(size * 0.66) && y < Math.round(size * 0.72) && x < size * 0.62)
      );
      raw[i] = page ? (line ? 43 : 255) : 43;
      raw[i + 1] = page ? (line ? 120 : 255) : 120;
      raw[i + 2] = page ? (line ? 197 : 255) : 197;
      raw[i + 3] = 255;
    }
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function pixel(size, x, y) {
  var margin = Math.max(2, Math.round(size * 0.12));
  var page = x >= margin && y >= margin && x < size - margin && y < size - margin;
  var line = page && x < size - margin * 2 && (
    (y >= Math.round(size * 0.30) && y < Math.round(size * 0.36)) ||
    (y >= Math.round(size * 0.48) && y < Math.round(size * 0.54)) ||
    (y >= Math.round(size * 0.66) && y < Math.round(size * 0.72) && x < size * 0.62)
  );
  if (!page) return [43, 120, 197, 255];
  if (line) return [43, 120, 197, 255];
  return [255, 255, 255, 255];
}

function bmpDib(size) {
  var header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4, 20);
  var xor = Buffer.alloc(size * size * 4);
  for (var y = 0; y < size; y++) {
    var srcY = size - 1 - y;
    for (var x = 0; x < size; x++) {
      var px = pixel(size, x, srcY);
      var o = (y * size + x) * 4;
      xor[o] = px[2];
      xor[o + 1] = px[1];
      xor[o + 2] = px[0];
      xor[o + 3] = px[3];
    }
  }
  var maskRow = Math.ceil(size / 32) * 4;
  var mask = Buffer.alloc(maskRow * size);
  return Buffer.concat([header, xor, mask]);
}

function ico(sizes) {
  var images = sizes.map(bmpDib);
  var header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  var offset = 6 + images.length * 16;
  var entries = images.map(function (image, i) {
    var entry = Buffer.alloc(16);
    entry[0] = sizes[i] >= 256 ? 0 : sizes[i];
    entry[1] = sizes[i] >= 256 ? 0 : sizes[i];
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    return entry;
  });
  return Buffer.concat([header].concat(entries).concat(images));
}

var dir = path.join(__dirname, "..", "resources", "icons");
fs.mkdirSync(dir, { recursive: true });
var small = png(32);
var mid = png(128);
var big = png(256);
fs.writeFileSync(path.join(dir, "32x32.png"), small);
fs.writeFileSync(path.join(dir, "128x128.png"), mid);
fs.writeFileSync(path.join(dir, "128x128@2x.png"), big);
fs.writeFileSync(path.join(dir, "icon.ico"), ico([32, 48, 64, 128, 256]));
console.log("icons written");
