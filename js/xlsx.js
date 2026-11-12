/* global ND */
var ND = ND || {};

ND.Xlsx = (function () {
  "use strict";

  var ROW_CAP = 5000;
  var DATE_NUM_FMT = {
    14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1,
    45: 1, 46: 1, 47: 1
  };

  function isExcelName(name) {
    return /\.xlsx$/i.test(String(name || "")) || /\.xlsm$/i.test(String(name || ""));
  }

  function isLegacyExcelName(name) {
    return /\.xls$/i.test(String(name || "")) && !isExcelName(name);
  }

  function normPath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function findEntry(entries, want) {
    want = normPath(want).toLowerCase();
    for (var i = 0; i < entries.length; i++) {
      if (normPath(entries[i].name).toLowerCase() === want) return entries[i];
    }
    return null;
  }

  function decodeXml(bytes) {
    if (!bytes || !bytes.length) return "";
    var text = new TextDecoder("utf-8").decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text;
  }

  function parseXml(text) {
    var doc = new DOMParser().parseFromString(text, "application/xml");
    var err = doc.querySelector("parsererror");
    if (err) throw new Error("Excel XML 无法解析");
    return doc;
  }

  function localName(node) {
    if (!node) return "";
    if (node.localName) return node.localName;
    var n = String(node.nodeName || "");
    var i = n.indexOf(":");
    return i >= 0 ? n.slice(i + 1) : n;
  }

  function children(node, name) {
    var out = [];
    if (!node) return out;
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType === 1 && localName(c) === name) out.push(c);
    }
    return out;
  }

  function firstChild(node, name) {
    var list = children(node, name);
    return list.length ? list[0] : null;
  }

  function attr(node, name) {
    if (!node || !node.getAttribute) return "";
    if (node.hasAttribute(name)) return node.getAttribute(name) || "";
    var bare = name.indexOf(":") >= 0 ? name.split(":").pop() : name;
    for (var i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i];
      if (a.name === name || a.localName === bare) return a.value || "";
    }
    return "";
  }

  function textOf(node) {
    if (!node) return "";
    return String(node.textContent || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function colRow(ref) {
    var m = String(ref || "").match(/^([A-Za-z]+)(\d+)$/);
    if (!m) return null;
    var col = 0;
    var letters = m[1].toUpperCase();
    for (var i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
    return { col: col - 1, row: parseInt(m[2], 10) - 1 };
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function excelSerialToText(serial) {
    var n = Number(serial);
    if (!isFinite(n)) return String(serial);
    var whole = Math.floor(n);
    var frac = n - whole;
    var ms = Math.round(frac * 86400000);
    var utc = Date.UTC(1899, 11, 30) + whole * 86400000 + ms;
    var d = new Date(utc);
    var y = d.getUTCFullYear();
    var mo = pad2(d.getUTCMonth() + 1);
    var day = pad2(d.getUTCDate());
    var h = d.getUTCHours();
    var mi = d.getUTCMinutes();
    var s = d.getUTCSeconds();
    if (h || mi || s || frac) {
      return y + "-" + mo + "-" + day + " " + pad2(h) + ":" + pad2(mi) + ":" + pad2(s);
    }
    return y + "-" + mo + "-" + day;
  }

  function looksDateFmt(code) {
    var c = String(code || "").toLowerCase();
    if (!c || c.indexOf("general") >= 0) return false;
    if (/[\[\]]/.test(c) && !/[ymdhs]/.test(c)) return false;
    return /[ymd]|h+|s+/.test(c.replace(/"[^"]*"/g, ""));
  }

  function sharedStringAt(list, idx) {
    var i = Number(idx);
    if (!isFinite(i) || i < 0 || i >= list.length) return "";
    return list[i];
  }

  function parseSharedStrings(doc) {
    var out = [];
    var root = doc.documentElement;
    var sis = children(root, "si");
    for (var i = 0; i < sis.length; i++) {
      var si = sis[i];
      var t = firstChild(si, "t");
      if (t) {
        out.push(textOf(t));
        continue;
      }
      var parts = [];
      var rs = children(si, "r");
      for (var r = 0; r < rs.length; r++) {
        var rt = firstChild(rs[r], "t");
        if (rt) parts.push(textOf(rt));
      }
      out.push(parts.join(""));
    }
    return out;
  }

  function parseStyles(doc) {
    var dateXf = {};
    if (!doc) return dateXf;
    var root = doc.documentElement;
    var numFmts = {};
    var numFmtRoot = firstChild(root, "numFmts");
    if (numFmtRoot) {
      children(numFmtRoot, "numFmt").forEach(function (nf) {
        var id = Number(attr(nf, "numFmtId"));
        var code = attr(nf, "formatCode");
        if (isFinite(id)) numFmts[id] = code;
      });
    }
    var xfsRoot = firstChild(root, "cellXfs");
    if (!xfsRoot) return dateXf;
    children(xfsRoot, "xf").forEach(function (xf, idx) {
      var id = Number(attr(xf, "numFmtId"));
      if (!isFinite(id)) return;
      if (DATE_NUM_FMT[id] || looksDateFmt(numFmts[id])) dateXf[idx] = true;
    });
    return dateXf;
  }

  function parseWorkbook(doc) {
    var sheets = [];
    var root = doc.documentElement;
    var sheetsNode = firstChild(root, "sheets");
    if (!sheetsNode) return sheets;
    children(sheetsNode, "sheet").forEach(function (sh) {
      var name = attr(sh, "name") || ("Sheet" + (sheets.length + 1));
      var rid = attr(sh, "r:id") || attr(sh, "id");
      if (!rid) {
        for (var i = 0; i < sh.attributes.length; i++) {
          var a = sh.attributes[i];
          if (a.localName === "id" && /id$/i.test(a.name)) {
            rid = a.value;
            break;
          }
        }
      }
      sheets.push({ name: name, rid: rid });
    });
    return sheets;
  }

  function parseRels(doc) {
    var map = {};
    if (!doc) return map;
    var root = doc.documentElement;
    children(root, "Relationship").forEach(function (rel) {
      var id = attr(rel, "Id");
      var target = attr(rel, "Target");
      if (!id || !target) return;
      var t = normPath(target);
      if (t.indexOf("xl/") !== 0 && t.charAt(0) !== "/") t = "xl/" + t.replace(/^\.\//, "");
      t = t.replace(/^\/+/, "");
      map[id] = t;
    });
    return map;
  }

  function inlineString(c) {
    var is = firstChild(c, "is");
    if (!is) return "";
    var t = firstChild(is, "t");
    if (t) return textOf(t);
    var parts = [];
    children(is, "r").forEach(function (r) {
      var rt = firstChild(r, "t");
      if (rt) parts.push(textOf(rt));
    });
    return parts.join("");
  }

  function cellValue(c, shared, dateXf) {
    var t = attr(c, "t") || "";
    var sIdx = attr(c, "s");
    var vNode = firstChild(c, "v");
    var v = vNode ? textOf(vNode) : "";
    if (t === "s") return sharedStringAt(shared, v);
    if (t === "inlineStr" || t === "str") {
      if (t === "inlineStr") return inlineString(c);
      return v;
    }
    if (t === "b") return v === "1" || v === "true" ? "TRUE" : "FALSE";
    if (t === "e") return v;
    if (v === "") return "";
    if (sIdx !== "" && dateXf[Number(sIdx)] && /^-?\d+(\.\d+)?$/.test(v)) {
      return excelSerialToText(v);
    }
    return v;
  }

  function parseSheet(doc, shared, dateXf, rowCap) {
    var root = doc.documentElement;
    var sheetData = firstChild(root, "sheetData");
    var grid = [];
    var maxCol = -1;
    var truncated = false;
    if (!sheetData) return { rows: [], truncated: false };
    var rowNodes = children(sheetData, "row");
    for (var i = 0; i < rowNodes.length; i++) {
      var rowNode = rowNodes[i];
      var rAttr = Number(attr(rowNode, "r"));
      var rowIndex = isFinite(rAttr) && rAttr > 0 ? rAttr - 1 : i;
      if (rowIndex >= rowCap) {
        truncated = true;
        break;
      }
      while (grid.length <= rowIndex) grid.push([]);
      var cells = children(rowNode, "c");
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        var ref = colRow(attr(c, "r"));
        var col = ref ? ref.col : j;
        if (ref && ref.row !== rowIndex) {
          /* 以 r 属性行为准已处理 */
        }
        var val = cellValue(c, shared, dateXf);
        if (col > maxCol) maxCol = col;
        while (grid[rowIndex].length <= col) grid[rowIndex].push("");
        grid[rowIndex][col] = val;
      }
    }
    if (rowNodes.length > rowCap) truncated = true;
    for (var r = 0; r < grid.length; r++) {
      while (grid[r].length <= maxCol) grid[r].push("");
    }
    return { rows: grid, truncated: truncated };
  }

  function csvEscape(field) {
    var s = field == null ? "" : String(field);
    if (/[",\n\r]/.test(s)) return "\"" + s.replace(/"/g, "\"\"") + "\"";
    return s;
  }

  function toCsv(rows) {
    return (rows || []).map(function (row) {
      return (row || []).map(csvEscape).join(",");
    }).join("\n");
  }

  function extractNamed(zipBytes, entries, path) {
    var entry = findEntry(entries, path);
    if (!entry) return Promise.resolve(null);
    return ND.Zip.extractZipEntry(zipBytes, entry).then(function (bytes) {
      return decodeXml(bytes);
    }, function () { return null; });
  }

  function parse(bytes, opts) {
    opts = opts || {};
    var rowCap = opts.rowCap == null ? ROW_CAP : opts.rowCap;
    if (!ND.Zip || !ND.Zip.isZip || !ND.Zip.isZip(bytes)) {
      return Promise.resolve({ error: "不是有效的 Excel 文件（xlsx）", text: "", sheet: "", sheetCount: 0, truncated: false });
    }
    var entries;
    try {
      entries = ND.Zip.listZip(bytes);
    } catch (err) {
      return Promise.resolve({ error: (err && err.message) || "无法读取 Excel 压缩包", text: "", sheet: "", sheetCount: 0, truncated: false });
    }
    if (!findEntry(entries, "xl/workbook.xml")) {
      return Promise.resolve({ error: "不是有效的 Excel 工作簿", text: "", sheet: "", sheetCount: 0, truncated: false });
    }

    return Promise.all([
      extractNamed(bytes, entries, "xl/workbook.xml"),
      extractNamed(bytes, entries, "xl/_rels/workbook.xml.rels"),
      extractNamed(bytes, entries, "xl/sharedStrings.xml"),
      extractNamed(bytes, entries, "xl/styles.xml")
    ]).then(function (parts) {
      var wbText = parts[0];
      var relsText = parts[1];
      var ssText = parts[2];
      var stylesText = parts[3];
      if (!wbText) throw new Error("缺少 workbook.xml");
      var sheets = parseWorkbook(parseXml(wbText));
      if (!sheets.length) throw new Error("工作簿里没有工作表");
      var rels = relsText ? parseRels(parseXml(relsText)) : {};
      var shared = ssText ? parseSharedStrings(parseXml(ssText)) : [];
      var dateXf = stylesText ? parseStyles(parseXml(stylesText)) : {};
      var first = sheets[0];
      var target = first.rid && rels[first.rid] ? rels[first.rid] : ("xl/worksheets/sheet1.xml");
      if (target.indexOf("xl/") !== 0) target = "xl/" + target.replace(/^\.\//, "");
      return extractNamed(bytes, entries, target).then(function (sheetText) {
        if (!sheetText) {
          // 回退按序号找第一张表
          var fallback = findEntry(entries, "xl/worksheets/sheet1.xml") ||
            entries.filter(function (e) { return /xl\/worksheets\/sheet\d+\.xml$/i.test(normPath(e.name)); })[0];
          if (!fallback) throw new Error("找不到工作表数据");
          return ND.Zip.extractZipEntry(bytes, fallback).then(function (b) {
            return { sheetText: decodeXml(b), sheetName: first.name, sheets: sheets };
          });
        }
        return { sheetText: sheetText, sheetName: first.name, sheets: sheets };
      }).then(function (info) {
        var parsed = parseSheet(parseXml(info.sheetText), shared, dateXf, rowCap);
        var text = toCsv(parsed.rows);
        return {
          error: null,
          text: text,
          sheet: info.sheetName,
          sheets: info.sheets.map(function (s) { return s.name; }),
          sheetCount: info.sheets.length,
          truncated: parsed.truncated,
          rowCount: parsed.rows.length
        };
      });
    }).catch(function (err) {
      return {
        error: (err && err.message) || "解析 Excel 失败",
        text: "",
        sheet: "",
        sheetCount: 0,
        truncated: false
      };
    });
  }

  return {
    ROW_CAP: ROW_CAP,
    isExcelName: isExcelName,
    isLegacyExcelName: isLegacyExcelName,
    parse: parse,
    toCsv: toCsv
  };
})();
