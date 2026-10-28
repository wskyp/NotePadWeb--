var ND = ND || {};

(function () {
  "use strict";

  function isFullWidth(cp) {
    if (cp >= 0x1100 && cp <= 0x115f) return true;
    if (cp === 0x2329 || cp === 0x232a) return true;
    if (cp >= 0x2e80 && cp <= 0xa4cf) return true;
    if (cp >= 0xac00 && cp <= 0xd7a3) return true;
    if (cp >= 0xf900 && cp <= 0xfaff) return true;
    if (cp >= 0xfe10 && cp <= 0xfe19) return true;
    if (cp >= 0xfe30 && cp <= 0xfe6f) return true;
    if (cp >= 0xff00 && cp <= 0xff60) return true;
    if (cp >= 0xffe0 && cp <= 0xffe6) return true;
    if (cp >= 0x1f300 && cp <= 0x1faff) return true;
    if (cp >= 0x20000 && cp <= 0x3fffd) return true;
    return false;
  }

  function nextCol(line, col) {
    if (col >= line.length) return line.length;
    var cp = line.codePointAt(col);
    return col + (cp > 0xffff ? 2 : 1);
  }

  function prevCol(line, col) {
    if (col <= 0) return 0;
    var cu = line.charCodeAt(col - 1);
    if (cu >= 0xdc00 && cu <= 0xdfff && col >= 2) {
      var cu2 = line.charCodeAt(col - 2);
      if (cu2 >= 0xd800 && cu2 <= 0xdbff) return col - 2;
    }
    return col - 1;
  }

  function advance(cp, visual, tabSize) {
    if (cp === 9) return tabSize - (visual % tabSize);
    if (isFullWidth(cp)) return 2;
    return 1;
  }

  function visualOf(line, index, tabSize) {
    var v = 0;
    var i = 0;
    var end = Math.min(index, line.length);
    while (i < end) {
      var cp = line.codePointAt(i);
      var n = cp > 0xffff ? 2 : 1;
      if (i + n > end) break;
      v += advance(cp, v, tabSize);
      i += n;
    }
    return v;
  }

  function visualCols(line, tabSize) {
    return visualOf(line, line.length, tabSize);
  }

  function indexAt(line, vcol, tabSize) {
    var v = 0;
    var i = 0;
    while (i < line.length) {
      var cp = line.codePointAt(i);
      var n = cp > 0xffff ? 2 : 1;
      var w = advance(cp, v, tabSize);
      if (vcol < v + w / 2) return i;
      if (vcol < v + w) return i + n;
      v += w;
      i += n;
    }
    return line.length;
  }

  function visualSpan(line, v1, v2, tabSize) {
    var v = 0;
    var i = 0;
    var start = null;
    while (i <= line.length) {
      if (start === null && v >= v1) start = i;
      if (v >= v2) return [start === null ? i : start, i];
      if (i >= line.length) break;
      var cp = line.codePointAt(i);
      var n = cp > 0xffff ? 2 : 1;
      var w = advance(cp, v, tabSize);
      if (start === null && v + w > v1) start = i;
      v += w;
      i += n;
    }
    if (start === null) start = line.length;
    return [start, line.length];
  }

  function clone(p) { return { line: p.line, col: p.col }; }

  function cmp(a, b) {
    if (a.line !== b.line) return a.line - b.line;
    return a.col - b.col;
  }

  function isWord(ch) {
    return /[A-Za-z0-9_\u4e00-\u9fff]/.test(ch);
  }

  function DocModel(lines) {
    this.lines = lines && lines.length ? lines.slice() : [""];
    this.cursor = { line: 0, col: 0 };
    this.anchor = { line: 0, col: 0 };
    this.prefCol = 0;
    this.tabSize = 4;
    this.insertSpaces = false;
    this.autoIndent = true;
    this.overtype = false;
    this.readOnly = false;
    this.undoStack = [];
    this.redoStack = [];
    this.colSel = null;
    this.bookmarks = new Set();
    this.folds = [];
    this.gen = 0;
    this.cleanGen = 0;
    this.version = 0;
    this._group = null;
    this.onChanged = null;
  }

  DocModel.prototype.dirty = function () { return this.gen !== this.cleanGen; };
  DocModel.prototype.markClean = function () { this.cleanGen = this.gen; this.changed(); };

  DocModel.prototype.changed = function () {
    this.version++;
    if (this.onChanged) this.onChanged();
  };

  DocModel.prototype.clamp = function (p) {
    var line = Math.max(0, Math.min(this.lines.length - 1, p.line | 0));
    var col = Math.max(0, Math.min(this.lines[line].length, p.col | 0));
    return { line: line, col: col };
  };

  DocModel.prototype.hasSelection = function () {
    return this.colSel || this.cursor.line !== this.anchor.line || this.cursor.col !== this.anchor.col;
  };

  DocModel.prototype.norm = function () {
    var a = this.anchor;
    var b = this.cursor;
    return cmp(a, b) <= 0 ? { a: clone(a), b: clone(b) } : { a: clone(b), b: clone(a) };
  };

  DocModel.prototype.rangeText = function (a, b) {
    a = this.clamp(a);
    b = this.clamp(b);
    if (cmp(a, b) > 0) { var t = a; a = b; b = t; }
    if (a.line === b.line) return this.lines[a.line].slice(a.col, b.col);
    var arr = [this.lines[a.line].slice(a.col)];
    for (var i = a.line + 1; i < b.line; i++) arr.push(this.lines[i]);
    arr.push(this.lines[b.line].slice(0, b.col));
    return arr.join("\n");
  };

  DocModel.prototype.selectedText = function () {
    if (this.colSel) return this.columnText();
    if (!this.hasSelection()) return "";
    var r = this.norm();
    return this.rangeText(r.a, r.b);
  };

  DocModel.prototype.columnText = function () {
    if (!this.colSel) return "";
    var c = this.normCol();
    var out = [];
    for (var line = c.l1; line <= c.l2; line++) out.push(this.sliceVisual(line, c.v1, c.v2));
    return out.join("\n");
  };

  DocModel.prototype.sliceVisual = function (line, v1, v2) {
    var s = this.lines[line] || "";
    var span = visualSpan(s, v1, v2, this.tabSize);
    return s.slice(span[0], span[1]);
  };

  DocModel.prototype.normCol = function () {
    var c = this.colSel;
    return {
      l1: Math.min(c.l1, c.l2),
      l2: Math.max(c.l1, c.l2),
      v1: Math.min(c.v1, c.v2),
      v2: Math.max(c.v1, c.v2)
    };
  };

  DocModel.prototype.posAfter = function (pos, text) {
    var parts = text.split("\n");
    if (parts.length === 1) return { line: pos.line, col: pos.col + parts[0].length };
    return { line: pos.line + parts.length - 1, col: parts[parts.length - 1].length };
  };

  DocModel.prototype._delete = function (a, b) {
    if (a.line === b.line) {
      var line = this.lines[a.line];
      this.lines[a.line] = line.slice(0, a.col) + line.slice(b.col);
      return;
    }
    var left = this.lines[a.line].slice(0, a.col);
    var right = this.lines[b.line].slice(b.col);
    this.lines.splice(a.line, b.line - a.line + 1, left + right);
    if (!this.lines.length) this.lines.push("");
  };

  DocModel.prototype._insert = function (pos, text) {
    var parts = text.split("\n");
    var line = this.lines[pos.line];
    var left = line.slice(0, pos.col);
    var right = line.slice(pos.col);
    if (parts.length === 1) {
      this.lines[pos.line] = left + parts[0] + right;
      return { line: pos.line, col: pos.col + parts[0].length };
    }
    var neu = [left + parts[0]];
    for (var i = 1; i < parts.length - 1; i++) neu.push(parts[i]);
    neu.push(parts[parts.length - 1] + right);
    this.lines.splice(pos.line, 1, neu[0]);
    for (var j = 1; j < neu.length; j++) this.lines.splice(pos.line + j, 0, neu[j]);
    return { line: pos.line + parts.length - 1, col: parts[parts.length - 1].length };
  };

  DocModel.prototype._shiftMarks = function (startLine, delta) {
    if (!delta) return;
    var next = new Set();
    this.bookmarks.forEach(function (b) {
      if (b <= startLine) next.add(b);
      else {
        var n = b + delta;
        if (n >= 0) next.add(n);
      }
    });
    this.bookmarks = next;
    this.folds = this.folds.filter(function (f) {
      return f.start >= 0 && f.end < 100000000 && f.start < f.end;
    });
  };

  DocModel.prototype.record = function (rec) {
    rec.t = Date.now();
    if (this._group) {
      this._group.push(rec);
      return;
    }
    var last = this.undoStack[this.undoStack.length - 1];
    if (rec.merge && last && !last.group && last.merge && !last.removed && !rec.removed &&
      rec.inserted && rec.inserted.length === 1 && last.pos.line === rec.pos.line &&
      last.pos.col + last.inserted.length === rec.pos.col && rec.t - last.t < 700) {
      last.inserted += rec.inserted;
      last.cursor = rec.cursor;
      last.anchor = rec.anchor;
      last.t = rec.t;
      return;
    }
    rec.prevGen = this.gen;
    this.gen++;
    rec.nextGen = this.gen;
    this.undoStack.push(rec);
    this.redoStack.length = 0;
    if (this.undoStack.length > 400) this.undoStack.shift();
  };

  DocModel.prototype.beginGroup = function () {
    this._group = [];
    this._groupPrev = this.gen;
    this.redoStack.length = 0;
  };

  DocModel.prototype.endGroup = function () {
    var g = this._group;
    this._group = null;
    if (!g || !g.length) return;
    this.gen++;
    this.undoStack.push({ group: g, prevGen: this._groupPrev, nextGen: this.gen });
    if (this.undoStack.length > 400) this.undoStack.shift();
  };

  DocModel.prototype.editRange = function (a, b, text, flags) {
    if (this.readOnly) return;
    a = this.clamp(a);
    b = this.clamp(b);
    if (cmp(a, b) > 0) { var sw = a; a = b; b = sw; }
    var cursor0 = clone(this.cursor);
    var anchor0 = clone(this.anchor);
    var removed = this.rangeText(a, b);
    var before = this.lines.length;
    this._delete(a, b);
    var end = this._insert(a, text);
    this._shiftMarks(a.line, this.lines.length - before);
    this.folds = this.folds.filter(function (f) { return f.end < this.lines.length && f.start < f.end; }, this);
    this.cursor = { line: end.line, col: end.col };
    this.anchor = { line: end.line, col: end.col };
    this.prefCol = visualOf(this.lines[end.line], end.col, this.tabSize);
    this.colSel = null;
    this.record({
      pos: { line: a.line, col: a.col },
      removed: removed,
      inserted: text,
      cursor: clone(this.cursor),
      anchor: clone(this.anchor),
      cursor0: cursor0,
      anchor0: anchor0,
      merge: !!(flags && flags.merge)
    });
    this.changed();
  };

  DocModel.prototype._apply = function (pos, removed, inserted) {
    var end = this.posAfter(pos, removed);
    this._delete(this.clamp(pos), this.clamp(end));
    this._insert(this.clamp(pos), inserted);
  };

  DocModel.prototype.undo = function () {
    if (this.readOnly) return;
    var rec = this.undoStack.pop();
    if (!rec) return;
    if (rec.group) {
      for (var i = rec.group.length - 1; i >= 0; i--) {
        var g = rec.group[i];
        this._apply(g.pos, g.inserted, g.removed);
      }
      var head = rec.group[0];
      this.cursor = clone(head.cursor0);
      this.anchor = clone(head.anchor0);
      this.gen = rec.prevGen;
    } else {
      this._apply(rec.pos, rec.inserted, rec.removed);
      this.cursor = clone(rec.cursor0);
      this.anchor = clone(rec.anchor0);
      this.gen = rec.prevGen;
    }
    this.cursor = this.clamp(this.cursor);
    this.anchor = this.clamp(this.anchor);
    this.prefCol = visualOf(this.lines[this.cursor.line], this.cursor.col, this.tabSize);
    this.redoStack.push(rec);
    this.changed();
  };

  DocModel.prototype.redo = function () {
    if (this.readOnly) return;
    var rec = this.redoStack.pop();
    if (!rec) return;
    if (rec.group) {
      for (var i = 0; i < rec.group.length; i++) {
        var g = rec.group[i];
        this._apply(g.pos, g.removed, g.inserted);
      }
      var tail = rec.group[rec.group.length - 1];
      this.cursor = clone(tail.cursor);
      this.anchor = clone(tail.anchor);
      this.gen = rec.nextGen;
    } else {
      this._apply(rec.pos, rec.removed, rec.inserted);
      this.cursor = clone(rec.cursor);
      this.anchor = clone(rec.anchor);
      this.gen = rec.nextGen;
    }
    this.cursor = this.clamp(this.cursor);
    this.anchor = this.clamp(this.anchor);
    this.undoStack.push(rec);
    this.changed();
  };

  DocModel.prototype.insertText = function (text) {
    if (this.readOnly || text == null) return;
    if (this.colSel) return this.insertColumn(String(text));
    var a;
    var b;
    var merge = false;
    if (this.hasSelection()) {
      var r = this.norm();
      a = r.a;
      b = r.b;
    } else if (this.overtype && text.length === 1 && text !== "\n" && this.cursor.col < this.lines[this.cursor.line].length) {
      a = clone(this.cursor);
      b = { line: a.line, col: nextCol(this.lines[a.line], a.col) };
    } else {
      a = clone(this.cursor);
      b = clone(this.cursor);
      merge = text.length === 1 && text !== "\n";
    }
    this.editRange(a, b, String(text), { merge: merge });
  };

  DocModel.prototype.insertColumn = function (text) {
    if (this.readOnly || !this.colSel) return;
    var c = this.normCol();
    var parts = String(text).split("\n");
    this.beginGroup();
    for (var line = c.l2; line >= c.l1; line--) {
      var piece = parts.length === 1 ? parts[0] : (parts[line - c.l1] || "");
      var s = this.lines[line];
      var span = visualSpan(s, c.v1, c.v2, this.tabSize);
      var have = visualCols(s, this.tabSize);
      var pad = "";
      if (have < c.v1) pad = " ".repeat(c.v1 - have);
      this.editRange({ line: line, col: span[0] }, { line: line, col: span[1] }, pad + piece);
    }
    this.endGroup();
    this.colSel = null;
    this.changed();
  };

  DocModel.prototype.backspace = function () {
    if (this.readOnly) return;
    if (this.colSel) return this.insertColumn("");
    if (this.hasSelection()) return this.insertText("");
    var c = this.cursor;
    if (c.line === 0 && c.col === 0) return;
    var a;
    if (c.col === 0) a = { line: c.line - 1, col: this.lines[c.line - 1].length };
    else {
      var line = this.lines[c.line];
      var ind = line.match(/^[ \t]*/)[0];
      if (this.insertSpaces && c.col <= ind.length && c.col > 0) {
        var v = visualOf(line, c.col, this.tabSize);
        var target = Math.floor((v - 1) / this.tabSize) * this.tabSize;
        a = { line: c.line, col: indexAt(line, target, this.tabSize) };
        if (a.col >= c.col) a = { line: c.line, col: prevCol(line, c.col) };
      } else a = { line: c.line, col: prevCol(line, c.col) };
    }
    this.editRange(a, c, "");
  };

  DocModel.prototype.deleteForward = function () {
    if (this.readOnly) return;
    if (this.colSel) return this.insertColumn("");
    if (this.hasSelection()) return this.insertText("");
    var c = this.cursor;
    var line = this.lines[c.line];
    var b;
    if (c.col >= line.length) {
      if (c.line >= this.lines.length - 1) return;
      b = { line: c.line + 1, col: 0 };
    } else b = { line: c.line, col: nextCol(line, c.col) };
    this.editRange(c, b, "");
  };

  DocModel.prototype.setCursor = function (pos, shift) {
    this.colSel = null;
    this.cursor = this.clamp(pos);
    if (!shift) this.anchor = clone(this.cursor);
    this.prefCol = visualOf(this.lines[this.cursor.line], this.cursor.col, this.tabSize);
    this.changed();
  };

  DocModel.prototype.collapseTo = function (pos) {
    this.colSel = null;
    this.cursor = this.clamp(pos);
    this.anchor = clone(this.cursor);
    this.prefCol = visualOf(this.lines[this.cursor.line], this.cursor.col, this.tabSize);
    this.changed();
  };

  DocModel.prototype.isHidden = function (line) {
    for (var i = 0; i < this.folds.length; i++) {
      var f = this.folds[i];
      if (line > f.start && line <= f.end) return true;
    }
    return false;
  };

  DocModel.prototype.stepLine = function (line, dir) {
    var l = line;
    var guard = 0;
    do {
      l += dir;
      guard++;
    } while (l >= 0 && l < this.lines.length && this.isHidden(l) && guard < this.lines.length);
    if (l < 0) return 0;
    if (l >= this.lines.length) return this.lines.length - 1;
    return l;
  };

  DocModel.prototype.move = function (kind, shift) {
    if (!shift && this.hasSelection() && (kind === "left" || kind === "right") && !this.colSel) {
      var r = this.norm();
      this.collapseTo(kind === "left" ? r.a : r.b);
      return;
    }
    this.colSel = null;
    var c = this.cursor;
    var line = this.lines[c.line];
    var next = clone(c);
    if (kind === "left") {
      if (c.col === 0 && c.line > 0) next = { line: c.line - 1, col: this.lines[c.line - 1].length };
      else next = { line: c.line, col: prevCol(line, c.col) };
    } else if (kind === "right") {
      if (c.col >= line.length && c.line < this.lines.length - 1) next = { line: c.line + 1, col: 0 };
      else next = { line: c.line, col: nextCol(line, c.col) };
    } else if (kind === "up") {
      var ul = this.stepLine(c.line, -1);
      next = { line: ul, col: indexAt(this.lines[ul], this.prefCol, this.tabSize) };
    } else if (kind === "down") {
      var dl = this.stepLine(c.line, 1);
      next = { line: dl, col: indexAt(this.lines[dl], this.prefCol, this.tabSize) };
    } else if (kind === "home") {
      var ind = line.match(/^[ \t]*/)[0].length;
      var homeCol = 0;
      if (ind > 0 && c.col === ind) homeCol = 0;
      else if (c.col === 0 || c.col > ind) homeCol = ind;
      else homeCol = 0;
      next = { line: c.line, col: homeCol };
    } else if (kind === "end") {
      next = { line: c.line, col: line.length };
    } else if (kind === "docStart") {
      next = { line: 0, col: 0 };
    } else if (kind === "docEnd") {
      next = { line: this.lines.length - 1, col: this.lines[this.lines.length - 1].length };
    } else if (kind === "wordLeft") {
      next = this.wordJump(c, -1);
    } else if (kind === "wordRight") {
      next = this.wordJump(c, 1);
    }
    this.cursor = this.clamp(next);
    if (!shift) this.anchor = clone(this.cursor);
    if (kind !== "up" && kind !== "down") this.prefCol = visualOf(this.lines[this.cursor.line], this.cursor.col, this.tabSize);
    this.changed();
  };

  DocModel.prototype.wordJump = function (c, dir) {
    var line = c.line;
    var col = c.col;
    var s = this.lines[line];
    if (dir < 0) {
      if (col === 0) {
        if (line === 0) return { line: 0, col: 0 };
        return { line: line - 1, col: this.lines[line - 1].length };
      }
      col = prevCol(s, col);
      var w = isWord(s.charAt(col));
      while (col > 0 && isWord(s.charAt(prevCol(s, col))) === w) col = prevCol(s, col);
      return { line: line, col: col };
    }
    if (col >= s.length) {
      if (line >= this.lines.length - 1) return { line: line, col: s.length };
      return { line: line + 1, col: 0 };
    }
    w = isWord(s.charAt(col));
    while (col < s.length && isWord(s.charAt(col)) === w) col = nextCol(s, col);
    return { line: line, col: col };
  };

  DocModel.prototype.selectAll = function () {
    this.colSel = null;
    this.anchor = { line: 0, col: 0 };
    var last = this.lines.length - 1;
    this.cursor = { line: last, col: this.lines[last].length };
    this.changed();
  };

  DocModel.prototype.selectLine = function (line) {
    line = Math.max(0, Math.min(this.lines.length - 1, line));
    this.colSel = null;
    this.anchor = { line: line, col: 0 };
    if (line < this.lines.length - 1) this.cursor = { line: line + 1, col: 0 };
    else this.cursor = { line: line, col: this.lines[line].length };
    this.changed();
  };

  DocModel.prototype.selectWordAt = function (line, col) {
    var s = this.lines[line] || "";
    if (!s) {
      this.collapseTo({ line: line, col: 0 });
      return;
    }
    var i = Math.max(0, Math.min(s.length - 1, col >= s.length ? s.length - 1 : col));
    if (col > 0 && col <= s.length && !isWord(s.charAt(i)) && isWord(s.charAt(i - 1))) i = i - 1;
    if (!isWord(s.charAt(i))) {
      this.anchor = { line: line, col: i };
      this.cursor = { line: line, col: nextCol(s, i) };
      this.changed();
      return;
    }
    var a = i;
    var b = i;
    while (a > 0 && isWord(s.charAt(prevCol(s, a)))) a = prevCol(s, a);
    while (b < s.length && isWord(s.charAt(b))) b = nextCol(s, b);
    this.colSel = null;
    this.anchor = { line: line, col: a };
    this.cursor = { line: line, col: b };
    this.changed();
  };

  DocModel.prototype.selectLines = function (a, b) {
    var l1 = Math.min(a, b);
    var l2 = Math.max(a, b);
    this.colSel = null;
    this.anchor = { line: l1, col: 0 };
    if (l2 < this.lines.length - 1) this.cursor = { line: l2 + 1, col: 0 };
    else this.cursor = { line: l2, col: this.lines[l2].length };
    this.changed();
  };

  DocModel.prototype.patchCursor = function (pos) {
    this.cursor = this.clamp(pos);
    this.anchor = clone(this.cursor);
    this.prefCol = visualOf(this.lines[this.cursor.line], this.cursor.col, this.tabSize);
    var rec = this.undoStack[this.undoStack.length - 1];
    if (rec && !rec.group) {
      rec.cursor = clone(this.cursor);
      rec.anchor = clone(this.anchor);
    }
    this.changed();
  };

  DocModel.prototype.duplicateLine = function () {
    if (this.readOnly) return;
    var line = this.cursor.line;
    var col = this.cursor.col;
    var t = this.lines[line];
    this.editRange({ line: line, col: t.length }, { line: line, col: t.length }, "\n" + t);
    this.patchCursor({ line: line + 1, col: Math.min(col, t.length) });
  };

  DocModel.prototype.deleteLine = function () {
    if (this.readOnly) return;
    var a = this.cursor.line;
    var b = a;
    if (this.hasSelection() && !this.colSel) {
      var r = this.norm();
      a = r.a.line;
      b = r.b.col === 0 && r.b.line > r.a.line ? r.b.line - 1 : r.b.line;
    }
    if (this.lines.length === 1 && a === 0 && b === 0) {
      this.editRange({ line: 0, col: 0 }, { line: 0, col: this.lines[0].length }, "");
      return;
    }
    if (b >= this.lines.length - 1 && a > 0) {
      this.editRange({ line: a - 1, col: this.lines[a - 1].length }, { line: b, col: this.lines[b].length }, "");
      this.patchCursor({ line: a - 1, col: Math.min(this.cursor.col, this.lines[a - 1].length) });
      return;
    }
    var end = Math.min(this.lines.length - 1, b + 1);
    this.editRange({ line: a, col: 0 }, { line: end, col: 0 }, "");
    this.patchCursor({ line: Math.min(a, this.lines.length - 1), col: 0 });
  };

  DocModel.prototype.moveLine = function (dir) {
    if (this.readOnly) return;
    var line = this.cursor.line;
    var col = this.cursor.col;
    if (dir < 0 && line === 0) return;
    if (dir > 0 && line >= this.lines.length - 1) return;
    var other = line + dir;
    var l1 = Math.min(line, other);
    var l2 = Math.max(line, other);
    var swapped = dir < 0 ? this.lines[line] + "\n" + this.lines[other] : this.lines[other] + "\n" + this.lines[line];
    this.editRange({ line: l1, col: 0 }, { line: l2, col: this.lines[l2].length }, swapped);
    this.patchCursor({ line: other, col: Math.min(col, this.lines[other].length) });
  };

  DocModel.prototype.lineRange = function () {
    if (!this.hasSelection() || this.colSel) return [this.cursor.line, this.cursor.line];
    var r = this.norm();
    var b = r.b.col === 0 && r.b.line > r.a.line ? r.b.line - 1 : r.b.line;
    return [r.a.line, b];
  };

  DocModel.prototype.toggleLineComment = function (prefix) {
    if (this.readOnly || !prefix) return;
    var range = this.lineRange();
    var a = range[0];
    var b = range[1];
    var all = true;
    var any = false;
    for (var i = a; i <= b; i++) {
      if (!this.lines[i].trim()) continue;
      any = true;
      var mm = this.lines[i].match(/^(\s*)/);
      var rest = this.lines[i].slice(mm[1].length);
      if (rest.indexOf(prefix) !== 0) all = false;
    }
    if (!any) all = false;
    this.beginGroup();
    for (i = b; i >= a; i--) {
      var s = this.lines[i];
      if (!s.trim()) continue;
      var m = s.match(/^(\s*)/);
      var ind = m[1];
      var body = s.slice(ind.length);
      var neu;
      if (all) {
        if (body.indexOf(prefix + " ") === 0) neu = ind + body.slice(prefix.length + 1);
        else if (body.indexOf(prefix) === 0) neu = ind + body.slice(prefix.length);
        else continue;
      } else neu = ind + prefix + " " + body;
      this.editRange({ line: i, col: 0 }, { line: i, col: s.length }, neu);
    }
    this.endGroup();
  };

  DocModel.prototype.toggleBlockComment = function (open, close) {
    if (this.readOnly || !open) return;
    if (!this.hasSelection()) this.selectWordAt(this.cursor.line, this.cursor.col);
    if (!this.hasSelection()) return;
    var r = this.norm();
    var text = this.rangeText(r.a, r.b);
    if (text.indexOf(open) === 0 && text.lastIndexOf(close) === text.length - close.length) {
      this.editRange(r.a, r.b, text.slice(open.length, text.length - close.length));
    } else this.editRange(r.a, r.b, open + text + close);
  };

  DocModel.prototype.indent = function (dir) {
    if (this.readOnly) return;
    var tab = this.insertSpaces ? " ".repeat(this.tabSize) : "\t";
    if (!this.hasSelection() || (this.norm().a.line === this.norm().b.line && !this.colSel)) {
      if (dir > 0) {
        var v = visualOf(this.lines[this.cursor.line], this.cursor.col, this.tabSize);
        var add = this.insertSpaces ? " ".repeat(this.tabSize - (v % this.tabSize) || this.tabSize) : "\t";
        if (this.insertSpaces && v % this.tabSize === 0) add = " ".repeat(this.tabSize);
        this.insertText(add);
      } else {
        var s = this.lines[this.cursor.line];
        var m = s.match(/^[ \t]*/);
        if (!m[0]) return;
        var cut = m[0].charAt(0) === "\t" ? 1 : Math.min(this.tabSize, m[0].length);
        this.editRange({ line: this.cursor.line, col: 0 }, { line: this.cursor.line, col: cut }, "");
      }
      return;
    }
    var range = this.lineRange();
    this.beginGroup();
    for (var i = range[1]; i >= range[0]; i--) {
      var line = this.lines[i];
      if (dir > 0) this.editRange({ line: i, col: 0 }, { line: i, col: 0 }, tab);
      else {
        var mm = line.match(/^[ \t]*/);
        if (!mm[0]) continue;
        var n = mm[0].charAt(0) === "\t" ? 1 : Math.min(this.tabSize, mm[0].length);
        this.editRange({ line: i, col: 0 }, { line: i, col: n }, "");
      }
    }
    this.endGroup();
  };

  DocModel.prototype.transformCase = function (mode) {
    if (this.readOnly) return;
    if (!this.hasSelection()) this.selectWordAt(this.cursor.line, this.cursor.col);
    if (!this.hasSelection()) return;
    var r = this.norm();
    var t = this.rangeText(r.a, r.b);
    if (mode === "upper") t = t.toUpperCase();
    else if (mode === "lower") t = t.toLowerCase();
    else t = t.replace(/[A-Za-z]+/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
    this.editRange(r.a, r.b, t);
  };

  DocModel.prototype.mapLines = function (fn) {
    if (this.readOnly) return;
    var range = this.hasSelection() && !this.colSel ? this.lineRange() : [0, this.lines.length - 1];
    this.beginGroup();
    for (var i = range[1]; i >= range[0]; i--) {
      var neu = fn(this.lines[i], i);
      if (neu === null) {
        if (this.lines.length === 1) this.editRange({ line: 0, col: 0 }, { line: 0, col: this.lines[0].length }, "");
        else if (i === this.lines.length - 1) this.editRange({ line: i - 1, col: this.lines[i - 1].length }, { line: i, col: this.lines[i].length }, "");
        else this.editRange({ line: i, col: 0 }, { line: i + 1, col: 0 }, "");
      } else if (neu !== this.lines[i]) {
        this.editRange({ line: i, col: 0 }, { line: i, col: this.lines[i].length }, neu);
      }
    }
    this.endGroup();
  };

  DocModel.prototype.trimTrailing = function () {
    this.mapLines(function (line) { return line.replace(/[ \t]+$/, ""); });
  };

  DocModel.prototype.deleteEmptyLines = function () {
    this.mapLines(function (line) { return line.trim() ? line : null; });
  };

  DocModel.prototype.sortLines = function (mode) {
    if (this.readOnly) return;
    var range = this.hasSelection() && !this.colSel ? this.lineRange() : [0, this.lines.length - 1];
    var chunk = this.lines.slice(range[0], range[1] + 1);
    var sorted = chunk.slice();
    if (mode === "asc") sorted.sort(function (x, y) { return x.localeCompare(y, "zh"); });
    else if (mode === "desc") sorted.sort(function (x, y) { return y.localeCompare(x, "zh"); });
    else if (mode === "reverse") sorted.reverse();
    else if (mode === "unique") {
      var seen = new Set();
      sorted = [];
      for (var i = 0; i < chunk.length; i++) if (!seen.has(chunk[i])) { seen.add(chunk[i]); sorted.push(chunk[i]); }
    }
    this.editRange({ line: range[0], col: 0 }, { line: range[1], col: this.lines[range[1]].length }, sorted.join("\n"));
  };

  DocModel.prototype.goto = function (line, col) {
    line = Math.max(1, line | 0) - 1;
    if (line >= this.lines.length) line = this.lines.length - 1;
    this.unfoldAround(line);
    this.collapseTo({ line: line, col: col ? (col - 1) : 0 });
  };

  DocModel.prototype.unfoldAround = function (line) {
    var before = this.folds.length;
    this.folds = this.folds.filter(function (f) { return line <= f.start || line > f.end; });
    if (this.folds.length !== before) this.changed();
  };

  DocModel.prototype.setColumn = function (sel, cursor) {
    this.colSel = sel;
    if (cursor) {
      this.cursor = this.clamp(cursor);
      this.anchor = clone(this.cursor);
      this.prefCol = visualOf(this.lines[this.cursor.line], this.cursor.col, this.tabSize);
    }
    this.changed();
  };

  DocModel.prototype.toggleFold = function (start, end) {
    if (end <= start) return;
    var idx = -1;
    for (var i = 0; i < this.folds.length; i++) if (this.folds[i].start === start) idx = i;
    if (idx >= 0) this.folds.splice(idx, 1);
    else {
      this.folds = this.folds.filter(function (f) { return f.end < start || f.start > end; });
      this.folds.push({ start: start, end: end });
    }
    this.changed();
  };

  DocModel.prototype.toggleBookmark = function (line) {
    if (this.bookmarks.has(line)) this.bookmarks.delete(line);
    else this.bookmarks.add(line);
    this.changed();
  };

  DocModel.prototype.nextBookmark = function (dir) {
    var list = Array.from(this.bookmarks).sort(function (a, b) { return a - b; });
    if (!list.length) return false;
    var cur = this.cursor.line;
    var pick = -1;
    if (dir >= 0) {
      for (var i = 0; i < list.length; i++) if (list[i] > cur) { pick = list[i]; break; }
      if (pick < 0) pick = list[0];
    } else {
      for (i = list.length - 1; i >= 0; i--) if (list[i] < cur) { pick = list[i]; break; }
      if (pick < 0) pick = list[list.length - 1];
    }
    this.goto(pick + 1, 1);
    return true;
  };

  DocModel.prototype.clearBookmarks = function () {
    this.bookmarks.clear();
    this.changed();
  };

  function compileFinder(opts) {
    var q = opts.query || "";
    if (!q) return null;
    if (opts.regex) {
      var src = q;
      var flags = opts.case ? "g" : "gi";
      var wrapped = q.match(/^\/([\s\S]+)\/([gimsuy]*)$/);
      if (wrapped) {
        src = wrapped[1];
        flags = wrapped[2] || flags;
        if (flags.indexOf("g") < 0) flags += "g";
      }
      try { return { re: new RegExp(src, flags) }; }
      catch (e) { return { error: e.message }; }
    }
    return { plain: opts.case ? q : q.toLowerCase(), raw: q, case: !!opts.case };
  }

  function wordAt(text, col, len) {
    var before = col > 0 ? text.charAt(col - 1) : "";
    var after = text.charAt(col + len) || "";
    if (before && isWord(before)) return false;
    if (after && isWord(after)) return false;
    return true;
  }

  function findAt(text, from, finder, opts) {
    if (!finder || finder.error) return null;
    if (finder.re) {
      var re = finder.re;
      re.lastIndex = from;
      var guard = 0;
      while (guard++ < 10000) {
        var m = re.exec(text);
        if (!m) return null;
        if (m.index < from) { re.lastIndex = from + 1; continue; }
        if (m[0].length === 0) { re.lastIndex = m.index + 1; continue; }
        if (opts.word && !wordAt(text, m.index, m[0].length)) { re.lastIndex = m.index + 1; continue; }
        return { col: m.index, len: m[0].length, groups: m };
      }
      return null;
    }
    var hay = finder.case ? text : text.toLowerCase();
    var i = hay.indexOf(finder.plain, from);
    while (i >= 0) {
      if (!opts.word || wordAt(text, i, finder.raw.length)) return { col: i, len: finder.raw.length, groups: [text.substr(i, finder.raw.length)] };
      i = hay.indexOf(finder.plain, i + 1);
    }
    return null;
  }

  function expandRepl(groups, repl, regex) {
    repl = repl == null ? "" : String(repl);
    if (!regex) return repl.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
    return repl.replace(/\$(\d+|&)/g, function (_, g) {
      if (g === "&") return groups[0] || "";
      return groups[Number(g)] || "";
    });
  }

  DocModel.prototype.findAll = function (opts, limit) {
    var finder = compileFinder(opts);
    if (!finder) return { matches: [], count: 0 };
    if (finder.error) return { error: finder.error, matches: [] };
    var cap = limit || 20000;
    var matches = [];
    var sel = opts.inSelection && this.hasSelection() && !this.colSel ? this.norm() : null;
    for (var line = 0; line < this.lines.length; line++) {
      if (sel && (line < sel.a.line || line > sel.b.line)) continue;
      var from = sel && line === sel.a.line ? sel.a.col : 0;
      var endCol = sel && line === sel.b.line ? sel.b.col : -1;
      while (from <= this.lines[line].length) {
        var m = findAt(this.lines[line], from, finder, opts);
        if (!m) break;
        if (endCol >= 0 && m.col >= endCol) break;
        matches.push({ line: line, col: m.col, len: m.len });
        if (matches.length >= cap) return { matches: matches, capped: true, count: matches.length };
        from = m.col + Math.max(1, m.len);
      }
    }
    return { matches: matches, count: matches.length };
  };

  function scanMatch(lines, finder, opts, line, col, dir) {
    if (dir >= 0) {
      for (var i = line; i < lines.length; i++) {
        var m = findAt(lines[i], i === line ? col : 0, finder, opts);
        if (m) return { line: i, col: m.col, len: m.len, groups: m.groups };
      }
      return null;
    }
    for (var j = line; j >= 0; j--) {
      var end = j === line ? col : lines[j].length + 1;
      var from = 0;
      var last = null;
      while (from < end) {
        var hit = findAt(lines[j], from, finder, opts);
        if (!hit || hit.col >= end) break;
        last = hit;
        from = hit.col + Math.max(1, hit.len);
      }
      if (last) return { line: j, col: last.col, len: last.len, groups: last.groups };
    }
    return null;
  }

  function placeFind(model, hit) {
    model.unfoldAround(hit.line);
    model.colSel = null;
    model.anchor = { line: hit.line, col: hit.col };
    model.cursor = { line: hit.line, col: hit.col + hit.len };
    model.prefCol = visualOf(model.lines[hit.line], model.cursor.col, model.tabSize);
    model.changed();
  }

  DocModel.prototype.findNext = function (opts, dir) {
    var finder = compileFinder(opts);
    if (!finder) return { found: false, count: 0 };
    if (finder.error) return { error: finder.error };
    if (this.lines.length > 20000) {
      var forward = dir >= 0;
      var line = this.cursor.line;
      var col = this.cursor.col;
      if (!forward) {
        var origin = this.hasSelection() ? this.norm().a : this.cursor;
        line = origin.line;
        col = origin.col;
      }
      var hit = scanMatch(this.lines, finder, opts, line, col, forward ? 1 : -1);
      if (!hit && opts.wrap !== false) {
        if (forward) hit = scanMatch(this.lines, finder, opts, 0, 0, 1);
        else {
          var last = this.lines.length - 1;
          hit = scanMatch(this.lines, finder, opts, last, this.lines[last].length + 1, -1);
        }
      }
      if (!hit) return { found: false, count: null, partial: true };
      placeFind(this, hit);
      return { found: true, count: null, index: null, match: hit, partial: true };
    }
    var res = this.findAll(opts, 50000);
    if (res.error) return res;
    var ms = res.matches;
    if (!ms.length) return { found: false, count: 0, partial: !!res.capped };
    var pick = -1;
    if (dir >= 0) {
      var line = this.cursor.line;
      var col = this.cursor.col;
      for (var i = 0; i < ms.length; i++) {
        if (ms[i].line > line || (ms[i].line === line && ms[i].col >= col)) { pick = i; break; }
      }
      if (pick < 0 && opts.wrap !== false) pick = 0;
    } else {
      var a = this.hasSelection() ? this.norm().a : this.cursor;
      for (i = ms.length - 1; i >= 0; i--) {
        if (ms[i].line < a.line || (ms[i].line === a.line && ms[i].col < a.col)) { pick = i; break; }
      }
      if (pick < 0 && opts.wrap !== false) pick = ms.length - 1;
    }
    if (pick < 0) return { found: false, count: ms.length, partial: !!res.capped };
    placeFind(this, ms[pick]);
    return { found: true, count: ms.length, index: pick, match: ms[pick], partial: !!res.capped };
  };

  DocModel.prototype.replaceOne = function (opts) {
    if (this.readOnly) return { found: false };
    if (this.hasSelection() && !this.colSel) {
      var r = this.norm();
      if (r.a.line === r.b.line) {
        var finder = compileFinder(opts);
        var m = finder && findAt(this.lines[r.a.line], r.a.col, finder, opts);
        if (m && m.col === r.a.col && m.col + m.len === r.b.col) {
          this.editRange(r.a, r.b, expandRepl(m.groups, opts.replace, opts.regex));
        }
      }
    }
    return this.findNext(opts, 1);
  };

  DocModel.prototype.replaceAll = function (opts) {
    if (this.readOnly) return { count: 0 };
    var finder = compileFinder(opts);
    if (!finder) return { count: 0 };
    if (finder.error) return { error: finder.error, count: 0 };
    var res = this.findAll(opts, 100000);
    if (!res.matches.length) return { count: 0, capped: !!res.capped };
    this.beginGroup();
    for (var i = res.matches.length - 1; i >= 0; i--) {
      var m = res.matches[i];
      var found = findAt(this.lines[m.line], m.col, finder, opts);
      var repl = expandRepl(found ? found.groups : [""], opts.replace, opts.regex);
      this.editRange({ line: m.line, col: m.col }, { line: m.line, col: m.col + m.len }, repl);
    }
    this.endGroup();
    return { count: res.matches.length, capped: !!res.capped };
  };

  DocModel.prototype.setText = function (text) {
    var lines = String(text).split("\n");
    this.lines = lines.length ? lines : [""];
    this.cursor = { line: 0, col: 0 };
    this.anchor = { line: 0, col: 0 };
    this.prefCol = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.colSel = null;
    this.bookmarks = new Set();
    this.folds = [];
    this.gen = 0;
    this.cleanGen = 0;
    this.changed();
  };

  DocModel.prototype.text = function () { return this.lines.join("\n"); };

  DocModel.prototype.matchBrackets = function () {
    var pairs = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{" };
    var line = this.lines[this.cursor.line];
    var col = this.cursor.col;
    var at = col - 1;
    var ch = at >= 0 ? line.charAt(at) : "";
    if (!pairs[ch]) { at = col; ch = line.charAt(at); }
    if (!pairs[ch]) return [];
    var open = "([{".indexOf(ch) >= 0;
    var other = pairs[ch];
    var depth = 0;
    var stackLine = this.cursor.line;
    var i = at;
    var guard = 0;
    while (stackLine >= 0 && stackLine < this.lines.length && guard++ < 20000) {
      var s = this.lines[stackLine];
      if (open) {
        if (stackLine !== this.cursor.line) i = 0;
        else i = at + 1;
        for (; i < s.length; i++) {
          var c = s.charAt(i);
          if (c === ch) depth++;
          else if (c === other) {
            if (depth === 0) return [{ line: this.cursor.line, col: at }, { line: stackLine, col: i }];
            depth--;
          }
        }
        stackLine++;
      } else {
        if (stackLine !== this.cursor.line) i = this.lines[stackLine].length - 1;
        else i = at - 1;
        for (; i >= 0; i--) {
          c = s.charAt(i);
          if (c === ch) depth++;
          else if (c === other) {
            if (depth === 0) return [{ line: this.cursor.line, col: at }, { line: stackLine, col: i }];
            depth--;
          }
        }
        stackLine--;
        s = this.lines[stackLine] || "";
      }
    }
    return [{ line: this.cursor.line, col: at }];
  };

  DocModel.prototype.stats = function () {
    var text = this.text();
    var sel = this.selectedText();
    return {
      lines: this.lines.length,
      chars: text.length,
      sel: sel.length,
      words: (text.match(/[A-Za-z0-9_\u4e00-\u9fff]+/g) || []).length
    };
  };

  ND.metrics = {
    isFullWidth: isFullWidth,
    nextCol: nextCol,
    prevCol: prevCol,
    visualOf: visualOf,
    visualCols: visualCols,
    indexAt: indexAt,
    visualSpan: visualSpan,
    advance: advance
  };
  ND.DocModel = DocModel;
})();
