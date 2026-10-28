var ND = ND || {};

(function () {
  "use strict";

  function diffSmall(a, b) {
    var n = a.length;
    var m = b.length;
    if (!n && !m) return [];
    if (!n) {
      var onlyB = [];
      for (var jb = 0; jb < m; jb++) onlyB.push(["ins", b[jb]]);
      return onlyB;
    }
    if (!m) {
      var onlyA = [];
      for (var ia = 0; ia < n; ia++) onlyA.push(["del", a[ia]]);
      return onlyA;
    }
    var dir = new Uint8Array((n + 1) * (m + 1));
    function at(i, j) { return i * (m + 1) + j; }
    var prev = new Int32Array(m + 1);
    var cur = new Int32Array(m + 1);
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) {
          cur[j] = prev[j + 1] + 1;
          dir[at(i, j)] = 0;
        } else if (prev[j] >= cur[j + 1]) {
          cur[j] = prev[j];
          dir[at(i, j)] = 1;
        } else {
          cur[j] = cur[j + 1];
          dir[at(i, j)] = 2;
        }
      }
      var tmp = prev;
      prev = cur;
      cur = tmp;
      cur.fill(0);
    }
    var ops = [];
    i = 0;
    j = 0;
    while (i < n && j < m) {
      var d = dir[at(i, j)];
      if (d === 0) { ops.push(["eq", a[i]]); i++; j++; }
      else if (d === 1) { ops.push(["del", a[i]]); i++; }
      else { ops.push(["ins", b[j]]); j++; }
    }
    while (i < n) { ops.push(["del", a[i]]); i++; }
    while (j < m) { ops.push(["ins", b[j]]); j++; }
    return ops;
  }

  function lis(seq) {
    var tails = [];
    var prev = new Int32Array(seq.length);
    prev.fill(-1);
    for (var i = 0; i < seq.length; i++) {
      var lo = 0;
      var hi = tails.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (seq[tails[mid]] < seq[i]) lo = mid + 1;
        else hi = mid;
      }
      if (lo) prev[i] = tails[lo - 1];
      tails[lo] = i;
    }
    var out = [];
    for (var k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) out.push(k);
    out.reverse();
    return out;
  }

  function anchored(a, b) {
    if (a.length * b.length <= 350000 && a.length <= 1600 && b.length <= 1600) return diffSmall(a, b);
    var countA = new Map();
    var countB = new Map();
    var posB = new Map();
    for (var i = 0; i < a.length; i++) countA.set(a[i], (countA.get(a[i]) || 0) + 1);
    for (var j = 0; j < b.length; j++) {
      countB.set(b[j], (countB.get(b[j]) || 0) + 1);
      if (!posB.has(b[j])) posB.set(b[j], j);
    }
    var matches = [];
    for (i = 0; i < a.length; i++) {
      var line = a[i];
      if (countA.get(line) === 1 && countB.get(line) === 1) matches.push([i, posB.get(line)]);
    }
    var order = lis(matches.map(function (p) { return p[1]; }));
    var anchors = order.map(function (idx) { return matches[idx]; });
    anchors.unshift([-1, -1]);
    anchors.push([a.length, b.length]);
    var ops = [];
    for (var p = 0; p < anchors.length - 1; p++) {
      var a0 = anchors[p][0] + 1;
      var b0 = anchors[p][1] + 1;
      var a1 = anchors[p + 1][0];
      var b1 = anchors[p + 1][1];
      var as = a.slice(a0, a1);
      var bs = b.slice(b0, b1);
      var mid;
      if (as.length * bs.length <= 350000 && as.length <= 1600 && bs.length <= 1600) mid = diffSmall(as, bs);
      else {
        mid = [];
        for (i = 0; i < as.length; i++) mid.push(["del", as[i]]);
        for (j = 0; j < bs.length; j++) mid.push(["ins", bs[j]]);
      }
      for (i = 0; i < mid.length; i++) ops.push(mid[i]);
      if (p < anchors.length - 2) ops.push(["eq", a[a1]]);
    }
    return ops;
  }

  function lineDiff(a, b) {
    var i0 = 0;
    var j0 = 0;
    while (i0 < a.length && j0 < b.length && a[i0] === b[j0]) { i0++; j0++; }
    var i1 = a.length - 1;
    var j1 = b.length - 1;
    while (i1 >= i0 && j1 >= j0 && a[i1] === b[j1]) { i1--; j1--; }
    var ops = [];
    for (var i = 0; i < i0; i++) ops.push(["eq", a[i]]);
    var mid = anchored(a.slice(i0, i1 + 1), b.slice(j0, j1 + 1));
    for (i = 0; i < mid.length; i++) ops.push(mid[i]);
    for (i = i1 + 1; i < a.length; i++) ops.push(["eq", a[i]]);
    return ops;
  }

  function sideRows(ops) {
    var rows = [];
    var ln = 1;
    var rn = 1;
    var i = 0;
    while (i < ops.length) {
      if (ops[i][0] === "eq") {
        rows.push({ cls: "eq", lt: ops[i][1], ln: ln++, rt: ops[i][1], rn: rn++ });
        i++;
        continue;
      }
      var dels = [];
      var inss = [];
      while (i < ops.length && ops[i][0] !== "eq") {
        if (ops[i][0] === "del") dels.push(ops[i][1]);
        else inss.push(ops[i][1]);
        i++;
      }
      var m = Math.max(dels.length, inss.length);
      for (var k = 0; k < m; k++) {
        var hasL = k < dels.length;
        var hasR = k < inss.length;
        var cls = "chg";
        if (hasL && !hasR) cls = "del";
        else if (!hasL && hasR) cls = "ins";
        rows.push({
          cls: cls,
          lt: hasL ? dels[k] : "",
          ln: hasL ? ln++ : "",
          rt: hasR ? inss[k] : "",
          rn: hasR ? rn++ : ""
        });
      }
    }
    var hunks = 0;
    var open = false;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].cls === "eq") open = false;
      else if (!open) { hunks++; open = true; }
    }
    return { rows: rows, hunks: hunks };
  }

  function intra(a, b) {
    if (a === b) return null;
    if (a.length > 360 || b.length > 360) return { full: true };
    var ops = diffSmall(Array.from(a), Array.from(b));
    var l = [];
    var r = [];
    var li = 0;
    var ri = 0;
    var ls = -1;
    var rs = -1;
    function close() {
      if (ls >= 0) { l.push([ls, li]); ls = -1; }
      if (rs >= 0) { r.push([rs, ri]); rs = -1; }
    }
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i][0];
      var ch = ops[i][1];
      if (op === "eq") { close(); li++; ri++; }
      else if (op === "del") { if (ls < 0) ls = li; li++; }
      else { if (rs < 0) rs = ri; ri++; }
      void ch;
    }
    close();
    return { l: l, r: r };
  }

  function compare(aLines, bLines) {
    return sideRows(lineDiff(aLines, bLines));
  }

  ND.Diff = { lineDiff: lineDiff, compare: compare, intra: intra };
})();
