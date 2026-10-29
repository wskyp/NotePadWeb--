/* global ND */
var ND = ND || {};

(function () {
  "use strict";
  var M = function () { return ND.metrics; };

  function Editor(container) {
    this.container = container;
    this.doc = null;
    this.model = null;
    this.showWs = false;
    this.wrap = false;
    this.minimapOn = true;
    this.folding = true;
    this.fontSize = 14;
    this.fontFamily = 'Consolas, "Cascadia Mono", "Microsoft YaHei Mono", monospace';
    this.lineHeight = 22;
    this.asciiW = 8.4;
    this.hexOn = false;
    this.bytes = null;
    this.hexPos = 0;
    this.nibble = 0;
    this.hexDirty = false;
    this.marks = new Map();
    this.composing = false;
    this.focused = false;
    this._cp = [];
    this._tok = new Map();
    this._foldCache = new Map();
    this._gen = -1;
    this._drag = null;
    this._raf = 0;
    this.autoPair = true;
    this.autoWord = true;
    this._sug = [];
    this._sugAt = 0;
    this._prefix = "";
    this._lex = null;
    this._lexTimer = 0;
    this.onContext = null;
    this.onHexDirty = null;
    this.build();
    this.measure();
  }

  Editor.prototype.build = function () {
    var self = this;
    this.container.innerHTML = "";
    this.root = document.createElement("div");
    this.root.className = "ed";
    this.gutter = document.createElement("div");
    this.gutter.className = "ed-gutter";
    this.gutterWin = document.createElement("div");
    this.gutterWin.className = "ed-gutter-win";
    this.gutter.appendChild(this.gutterWin);
    this.view = document.createElement("div");
    this.view.className = "ed-view";
    this.spacer = document.createElement("div");
    this.spacer.className = "ed-spacer";
    this.cur = document.createElement("div");
    this.cur.className = "ed-cur";
    this.codeWin = document.createElement("div");
    this.codeWin.className = "ed-code-win";
    this.caret = document.createElement("div");
    this.caret.className = "ed-caret";
    this.spacer.appendChild(this.cur);
    this.spacer.appendChild(this.codeWin);
    this.spacer.appendChild(this.caret);
    this.view.appendChild(this.spacer);
    this.map = document.createElement("canvas");
    this.map.className = "ed-map";
    this.root.appendChild(this.gutter);
    this.root.appendChild(this.view);
    this.root.appendChild(this.map);
    this.container.appendChild(this.root);
    this.ime = document.createElement("textarea");
    this.ime.className = "ed-ime";
    this.ime.setAttribute("autocomplete", "off");
    this.ime.setAttribute("autocorrect", "off");
    this.ime.setAttribute("autocapitalize", "off");
    this.ime.setAttribute("spellcheck", "false");
    this.ime.setAttribute("wrap", "off");
    this.ime.setAttribute("aria-label", "编辑器");
    document.body.appendChild(this.ime);
    this.suggest = document.createElement("div");
    this.suggest.className = "ed-suggest hidden";
    document.body.appendChild(this.suggest);
    this.suggest.addEventListener("mousedown", function (e) {
      e.preventDefault();
      var item = e.target.closest("[data-sug]");
      if (!item) return;
      self._sugAt = Number(item.getAttribute("data-sug"));
      self.acceptSuggest();
      self.focus();
    });

    this.view.addEventListener("scroll", function () {
      if (self._scrollLock) return;
      self.schedule();
    });
    this.view.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      self.focus();
      self.onMouse(e, true);
    });
    this.gutter.addEventListener("mousedown", function (e) {
      if (e.button !== 0 || self.hexOn || !self.model) return;
      e.preventDefault();
      self.focus();
      var cell = e.target.closest("[data-line]");
      if (!cell) return;
      var line = Number(cell.getAttribute("data-line"));
      if (e.target.closest(".fold")) {
        var end = self.foldEnd(line);
        if (end > line) self.model.toggleFold(line, end);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.target.closest(".bm")) {
        self.model.toggleBookmark(line);
        return;
      }
      if (e.shiftKey) self.model.selectLines(self.model.anchor.line, line);
      else self.model.selectLine(line);
      self.reveal();
    });
    this.view.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      if (self.onContext) self.onContext(e.clientX, e.clientY);
    });
    this.map.addEventListener("mousedown", function (e) {
      if (!self.model || self.hexOn) return;
      var r = self.map.getBoundingClientRect();
      var ratio = (e.clientY - r.top) / Math.max(1, r.height);
      var v = Math.floor(ratio * self.visualCount());
      self.view.scrollTop = v * self.lineHeight;
    });
    document.addEventListener("mousemove", function (e) { if (self._drag) self.onMouse(e, false); });
    document.addEventListener("mouseup", function () { self._drag = null; });
    this.ime.addEventListener("focus", function () { self.focused = true; self.schedule(); });
    this.ime.addEventListener("blur", function () { self.focused = false; self.clearSuggest(); self.schedule(); });
    this.ime.addEventListener("compositionstart", function () {
      self.composing = true;
      self.ime.classList.add("composing");
    });
    this.ime.addEventListener("compositionend", function (e) {
      self.composing = false;
      self.ime.classList.remove("composing");
      var t = e.data || self.ime.value;
      self.ime.value = "";
      if (t && self.model && !self.hexOn) {
        self._revealNext = true;
        if (!(t.length === 1 && self.tryPair(t))) self.model.insertText(t);
        self.updateSuggest();
      }
      self.schedule();
    });
    this.ime.addEventListener("input", function () {
      if (self.composing) {
        self.ime.style.width = Math.max(24, (self.ime.value.length + 1) * self.asciiW) + "px";
        return;
      }
      var t = self.ime.value;
      if (!t || !self.model || self.hexOn) { self.ime.value = ""; return; }
      self.ime.value = "";
      self._revealNext = true;
      if (!(t.length === 1 && self.tryPair(t))) self.model.insertText(t);
      self.updateSuggest();
    });
    this.ime.addEventListener("keydown", function (e) { self.onKey(e); });
    window.addEventListener("resize", function () { self.measure(); self.schedule(); });
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self.schedule(); });
      this._ro.observe(this.view);
    }
  };

  Editor.prototype.lang = function () {
    return (this.doc && this.doc.language) || "plaintext";
  };

  Editor.prototype.bind = function (doc) {
    var self = this;
    if (this.model) this.model.onChanged = null;
    this.doc = doc;
    this.model = doc ? doc.model : null;
    this.hexOn = !!(doc && doc.hex);
    this.bytes = doc && doc.bytes ? doc.bytes : null;
    this.hexPos = doc && doc.hexPos ? doc.hexPos : 0;
    this.nibble = 0;
    this.hexDirty = false;
    this.marks = new Map();
    this._cp = [];
    this._tok = new Map();
    this._foldCache = new Map();
    this._gen = -1;
    this._lex = null;
    clearTimeout(this._lexTimer);
    this.clearSuggest();
    if (this.model) {
      this.model.onChanged = function () {
        if (self._gen !== self.model.gen) {
          self._gen = self.model.gen;
          self._cp = [];
          self._tok = new Map();
          self._foldCache = new Map();
          self._max = null;
        }
        if (self._revealNext) {
          self._revealNext = false;
          self.reveal();
        } else self.schedule();
      };
    }
    this.syncMetrics();
    this.schedule();
  };

  Editor.prototype.focus = function () {
    if (this.ime) this.ime.focus({ preventScroll: true });
  };

  Editor.prototype.syncMetrics = function () {
    if (!this.model) return;
    this.model.tabSize = this.tabSize || this.model.tabSize;
    this.tabSize = this.model.tabSize;
  };

  Editor.prototype.setFont = function (size, family) {
    if (size) this.fontSize = size;
    if (family) this.fontFamily = family;
    this.lineHeight = Math.round(this.fontSize * 1.55);
    if (this.lineHeight < this.fontSize + 4) this.lineHeight = this.fontSize + 6;
    this.measure();
    this.schedule();
  };

  Editor.prototype.measure = function () {
    var probe = document.createElement("span");
    probe.style.cssText = "position:absolute;left:-9999px;top:0;white-space:pre;font-family:" + this.fontFamily + ";font-size:" + this.fontSize + "px;line-height:" + this.lineHeight + "px;";
    probe.textContent = "0000000000";
    document.body.appendChild(probe);
    var w = probe.getBoundingClientRect().width / 10;
    probe.textContent = "中";
    var cjk = probe.getBoundingClientRect().width;
    probe.remove();
    if (w > 1) this.asciiW = w;
    var ratio = w ? cjk / w : 2;
    ND.metrics.cjkWidth = ratio > 1.6 ? 2 : 1;
    this.root.style.setProperty("--ed-font-size", this.fontSize + "px");
    this.root.style.setProperty("--ed-lh", this.lineHeight + "px");
    this.root.style.setProperty("--ed-font", this.fontFamily);
    this.gutter.style.fontSize = this.fontSize + "px";
    this.gutter.style.lineHeight = this.lineHeight + "px";
    this.gutter.style.fontFamily = this.fontFamily;
  };

  Editor.prototype.schedule = function () {
    var self = this;
    if (this._raf) return;
    this._raf = requestAnimationFrame(function () {
      self._raf = 0;
      self.render();
    });
  };

  Editor.prototype.gutterWidth = function () {
    if (this.hexOn) return 0;
    var n = this.model ? String(this.model.lines.length).length : 2;
    return Math.max(46, 18 + n * this.asciiW + 16);
  };

  Editor.prototype.wrapCols = function () {
    var inner = this.view.clientWidth - 12;
    return Math.max(8, Math.floor(inner / this.asciiW));
  };

  Editor.prototype.lineParts = function (line) {
    if (!this.wrap) return [{ from: 0, to: this.model.lines[line].length, v: 0 }];
    var text = this.model.lines[line];
    var cols = this.wrapCols();
    var tab = this.model.tabSize;
    var out = [];
    var i = 0;
    var v = 0;
    var from = 0;
    var vfrom = 0;
    while (i < text.length) {
      var cp = text.codePointAt(i);
      var n = cp > 0xffff ? 2 : 1;
      var w = M().advance(cp, v, tab);
      if (v - vfrom + w > cols && i > from) {
        out.push({ from: from, to: i, v: vfrom });
        from = i;
        vfrom = v;
      }
      v += w;
      i += n;
    }
    out.push({ from: from, to: text.length, v: vfrom });
    return out;
  };

  Editor.prototype.rebuild = function () {
    var m = this.model;
    if (!m || this.hexOn) {
      this._vcount = this.hexOn && this.bytes ? Math.max(1, Math.ceil((this.bytes.length + 1) / 16)) : 1;
      this._visLine = null;
      return;
    }
    if (!this.wrap && !m.folds.length) {
      this._vcount = m.lines.length;
      this._visLine = null;
      this._lineVis = null;
      return;
    }
    var n = m.lines.length;
    var hidden = new Uint8Array(n);
    for (var f = 0; f < m.folds.length; f++) {
      var fold = m.folds[f];
      for (var i = fold.start + 1; i <= fold.end && i < n; i++) hidden[i] = 1;
    }
    var visLine = [];
    var visSub = [];
    var lineVis = new Int32Array(n);
    lineVis.fill(-1);
    for (var line = 0; line < n; line++) {
      if (hidden[line]) continue;
      lineVis[line] = visLine.length;
      var parts = this.wrap ? this.lineParts(line) : [0];
      for (var s = 0; s < parts.length; s++) {
        visLine.push(line);
        visSub.push(s);
      }
    }
    this._visLine = visLine;
    this._visSub = visSub;
    this._lineVis = lineVis;
    this._vcount = visLine.length || 1;
  };

  Editor.prototype.visualCount = function () {
    this.rebuild();
    return this._vcount || 1;
  };

  Editor.prototype.visualIndex = function (line, col) {
    if (!this.model) return 0;
    if (!this._lineVis) return line;
    var base = this._lineVis[line];
    if (base < 0) {
      var l = line;
      while (l > 0 && this._lineVis[l] < 0) l--;
      return Math.max(0, this._lineVis[l]);
    }
    if (!this.wrap) return base;
    var parts = this.lineParts(line);
    var sub = 0;
    for (var s = 0; s < parts.length; s++) {
      if (col < parts[s].to || s === parts.length - 1) {
        sub = s;
        if (col === parts[s].to && s < parts.length - 1) sub = s + 1;
        break;
      }
    }
    return base + sub;
  };

  Editor.prototype.infoAt = function (v) {
    if (!this._visLine) return { line: Math.max(0, Math.min((this.model.lines.length || 1) - 1, v)), sub: 0 };
    v = Math.max(0, Math.min(this._visLine.length - 1, v));
    return { line: this._visLine[v], sub: this._visSub[v] };
  };

  Editor.prototype.maxVisual = function () {
    if (!this.model) return 0;
    if (this._max != null && this._max.gen === this.model.gen) return this._max.v;
    var v = 0;
    var tab = this.model.tabSize;
    var limit = this.model.lines.length;
    if (limit > 1500) limit = 1500;
    for (var i = 0; i < limit; i++) {
      var row = this.model.lines[i];
      var c = row.length > 4000 ? row.length : M().visualCols(row, tab);
      if (c > v) v = c;
    }
    this._max = { gen: this.model.gen, v: v };
    return v;
  };

  Editor.prototype.stateBefore = function (line) {
    var lang = this.lang();
    if (lang === "plaintext" || lang === "json" || lang === "markdown" || lang === "properties") return 0;
    var state = 0;
    var start = 0;
    for (var i = this._cp.length - 1; i >= 0; i--) {
      if (this._cp[i].line <= line && this._cp[i].lang === lang) {
        start = this._cp[i].line;
        state = this._cp[i].state;
        break;
      }
    }
    for (var ln = start; ln < line; ln++) {
      state = ND.Highlight.tokenize(this.model.lines[ln], state, lang).state;
      if ((ln + 1) % 48 === 0) this._cp.push({ line: ln + 1, state: state, lang: lang });
    }
    return state;
  };

  Editor.prototype.tokensFor = function (line, state) {
    var text = this.model.lines[line];
    var lang = this.lang();
    var c = this._tok.get(line);
    if (c && c.text === text && c.state === state && c.lang === lang) return c.tokens;
    var r = ND.Highlight.tokenize(text, state, lang);
    this._tok.set(line, { text: text, state: state, lang: lang, tokens: r.tokens, end: r.state });
    return r.tokens;
  };

  Editor.prototype.foldEnd = function (line) {
    if (!this.folding) return -1;
    if (this._foldCache.has(line)) return this._foldCache.get(line);
    var lines = this.model.lines;
    var s = lines[line];
    var end = -1;
    var lang = this.lang();
    if (lang === "python" || lang === "yaml") {
      var ind = (s.match(/^[ \t]*/) || [""])[0].length;
      if (s.trim() && line + 1 < lines.length) {
        var nind = (lines[line + 1].match(/^[ \t]*/) || [""])[0].length;
        if (lines[line + 1].trim() && nind > ind) {
          end = line + 1;
          var foldLimit = Math.min(lines.length, line + 800);
          while (end + 1 < foldLimit) {
            if (!lines[end + 1].trim()) { end++; continue; }
            var ii = (lines[end + 1].match(/^[ \t]*/) || [""])[0].length;
            if (ii <= ind) break;
            end++;
          }
        }
      }
    } else if (s.indexOf("{") >= 0 || s.indexOf("(") >= 0) {
      var depth = 0;
      var started = false;
      var limit = Math.min(lines.length, line + 600);
      for (var i = line; i < limit; i++) {
        var t = lines[i];
        for (var k = (i === line ? 0 : 0); k < t.length; k++) {
          var ch = t.charAt(k);
          if (ch === "{" || ch === "(") { depth++; started = true; }
          else if (ch === "}" || ch === ")") {
            depth--;
            if (started && depth <= 0) { end = i; break; }
          }
        }
        if (end >= 0) break;
      }
      if (end === line) end = -1;
    }
    this._foldCache.set(line, end);
    return end;
  };

  Editor.prototype.selRange = function (line) {
    var m = this.model;
    if (m.colSel) {
      var c = m.normCol();
      if (line < c.l1 || line > c.l2) return null;
      var span = M().visualSpan(m.lines[line], c.v1, c.v2, m.tabSize);
      return { a: span[0], b: span[1] };
    }
    if (m.cursor.line === m.anchor.line && m.cursor.col === m.anchor.col) return null;
    var r = m.norm();
    if (line < r.a.line || line > r.b.line) return null;
    var len = m.lines[line].length;
    if (line === r.a.line && line === r.b.line) return { a: r.a.col, b: r.b.col };
    if (line === r.a.line) return { a: r.a.col, b: len };
    if (line === r.b.line) return { a: 0, b: r.b.col };
    return { a: 0, b: len };
  };

  Editor.prototype.htmlSlice = function (line, from, to, tokens) {
    var text = this.model.lines[line];
    var tab = this.model.tabSize;
    var sel = this.selRange(line);
    var marks = this.marks.get(line) || null;
    var brackets = this._brackets;
    var showWs = this.showWs;
    var html = "";
    var i = from;
    var v = M().visualOf(text, from, tab);
    while (i < to) {
      var cp = text.codePointAt(i);
      var n = cp > 0xffff ? 2 : 1;
      var w = M().advance(cp, v, tab);
      var cls = "";
      if (tokens) {
        for (var t = 0; t < tokens.length; t++) {
          if (i >= tokens[t].from && i < tokens[t].to) { cls = tokens[t].cls; break; }
        }
      }
      if (sel && i >= sel.a && i < sel.b) cls += (cls ? " " : "") + "sel";
      if (marks) {
        for (var k = 0; k < marks.length; k++) {
          if (i >= marks[k].col && i < marks[k].col + marks[k].len) { cls += (cls ? " " : "") + "mk"; break; }
        }
      }
      if (brackets) {
        for (var b = 0; b < brackets.length; b++) {
          if (brackets[b].line === line && brackets[b].col === i) { cls += (cls ? " " : "") + "br"; break; }
        }
      }
      var chunk = "";
      var cls0 = cls;
      var j = i;
      var vj = v;
      while (j < to) {
        var cp2 = text.codePointAt(j);
        var n2 = cp2 > 0xffff ? 2 : 1;
        var cls2 = "";
        if (tokens) {
          for (t = 0; t < tokens.length; t++) {
            if (j >= tokens[t].from && j < tokens[t].to) { cls2 = tokens[t].cls; break; }
          }
        }
        if (sel && j >= sel.a && j < sel.b) cls2 += (cls2 ? " " : "") + "sel";
        if (marks) {
          for (k = 0; k < marks.length; k++) {
            if (j >= marks[k].col && j < marks[k].col + marks[k].len) { cls2 += (cls2 ? " " : "") + "mk"; break; }
          }
        }
        if (brackets) {
          for (b = 0; b < brackets.length; b++) {
            if (brackets[b].line === line && brackets[b].col === j) { cls2 += (cls2 ? " " : "") + "br"; break; }
          }
        }
        if (cls2 !== cls0 || cp2 === 9) break;
        if (showWs && cp2 === 32) chunk += "·";
        else chunk += text.slice(j, j + n2);
        vj += M().advance(cp2, vj, tab);
        j += n2;
        if (chunk.length > 400) break;
      }
      if (cp === 9 && j === i) {
        var spaces = w;
        var tabHtml = showWs ? "→" + (spaces > 1 ? "·".repeat(spaces - 1) : "") : " ".repeat(spaces);
        chunk = tabHtml;
        j = i + 1;
      }
      if (!chunk) {
        chunk = text.slice(i, i + n);
        j = i + n;
      }
      if (cls0) html += "<span class=\"" + cls0 + "\">" + ND.esc(chunk) + "</span>";
      else html += ND.esc(chunk);
      v = M().visualOf(text, j, tab);
      i = j;
    }
    if (!html) html = " ";
    return html;
  };

  Editor.prototype.render = function () {
    if (!this.model) return;
    if (this.hexOn) return this.renderHex();
    var m = this.model;
    var lh = this.lineHeight;
    var gw = this.gutterWidth();
    this.gutter.style.width = gw + "px";
    this.map.style.display = this.minimapOn ? "block" : "none";
    var total = this.visualCount();
    var maxC = this.wrap ? this.wrapCols() : this.maxVisual();
    var width = Math.max(this.view.clientWidth, Math.ceil(maxC * this.asciiW) + 40);
    this.spacer.style.height = total * lh + "px";
    this.spacer.style.width = width + "px";
    var st = this.view.scrollTop;
    var start = Math.max(0, Math.floor(st / lh) - 3);
    var count = Math.ceil((this.view.clientHeight || 400) / lh) + 8;
    var end = Math.min(total, start + count);
    var v0 = 0;
    var v1 = maxC + 2;
    if (!this.wrap) {
      v0 = Math.max(0, Math.floor(this.view.scrollLeft / this.asciiW) - 2);
      v1 = v0 + Math.ceil((this.view.clientWidth || 800) / this.asciiW) + 8;
    }
    this._brackets = m.matchBrackets();
    var gutter = "";
    var code = "";
    var lang = this.lang();
    var stateLine = -1;
    var state = 0;
    for (var v = start; v < end; v++) {
      var info = this.infoAt(v);
      var line = info.line;
      var text = m.lines[line];
      var parts = this.wrap ? this.lineParts(line) : [{ from: 0, to: text.length, v: 0 }];
      var part = parts[info.sub] || parts[0];
      if (line !== stateLine) {
        state = this.stateBefore(line);
        stateLine = line;
      }
      var tokens = null;
      if (lang !== "plaintext" && text.length < 20000) tokens = this.tokensFor(line, state);
      if (!this.wrap) {
        var wide = text.length > 4000 ? text.length : M().visualCols(text, m.tabSize);
        if (!this._max || wide > this._max.v) {
          this._max = { gen: m.gen, v: wide };
          width = Math.max(width, Math.ceil(wide * this.asciiW) + 40);
          this.spacer.style.width = width + "px";
        }
      }
      var from = part.from;
      var to = part.to;
      if (!this.wrap) {
        var span = M().visualSpan(text, v0, v1, m.tabSize);
        from = Math.max(part.from, span[0]);
        to = Math.min(part.to, span[1]);
        if (to < from) to = from;
      }
      var y = (v - start) * lh;
      var cur = m.cursor.line === line && info.sub === 0 ? " cur" : "";
      var num = info.sub === 0 ? String(line + 1) : "";
      var fold = "";
      var folded = false;
      if (info.sub === 0 && this.folding) {
        var fe = this.foldEnd(line);
        if (fe > line) {
          folded = m.folds.some(function (f) { return f.start === line; });
          fold = "<i class=\"fold\">" + (folded ? "▸" : "▾") + "</i>";
        } else fold = "<i class=\"fold none\"></i>";
      } else fold = "<i class=\"fold none\"></i>";
      var bm = m.bookmarks.has(line) && info.sub === 0 ? "<i class=\"bm on\"></i>" : "<i class=\"bm\"></i>";
      gutter += "<div class=\"ln" + (m.cursor.line === line ? " cur" : "") + "\" data-line=\"" + line + "\" style=\"height:" + lh + "px;transform:translateY(" + y + "px)\">" + bm + fold + "<span>" + num + "</span></div>";
      var pad = 0;
      if (!this.wrap) pad = M().visualOf(text, from, m.tabSize) * this.asciiW;
      else pad = 0;
      var inner = this.htmlSlice(line, from, to, tokens);
      if (info.sub === 0 && folded) inner += "<span class=\"foldmark\">···</span>";
      code += "<div class=\"ed-line" + cur + "\" style=\"height:" + lh + "px;transform:translate(" + pad + "px," + (v * lh) + "px)\">" + inner + "</div>";
    }
    this.gutterWin.style.transform = "translateY(" + (start * lh - st) + "px)";
    this.gutterWin.innerHTML = gutter;
    this.codeWin.innerHTML = code;
    var caretV = this.visualIndex(m.cursor.line, m.cursor.col);
    var caretX = M().visualOf(m.lines[m.cursor.line], m.cursor.col, m.tabSize) * this.asciiW;
    if (this.wrap) {
      var cp = this.lineParts(m.cursor.line);
      var sub = caretV - (this._lineVis ? this._lineVis[m.cursor.line] : m.cursor.line);
      if (cp[sub]) caretX = (M().visualOf(m.lines[m.cursor.line], m.cursor.col, m.tabSize) - cp[sub].v) * this.asciiW;
    }
    this.cur.style.transform = "translateY(" + caretV * lh + "px)";
    this.cur.style.height = lh + "px";
    this.cur.style.display = m.hasSelection() && !m.colSel ? "none" : "block";
    this.caret.style.transform = "translate(" + caretX + "px," + (caretV * lh) + "px)";
    this.caret.style.height = lh + "px";
    this.caret.style.display = this.focused && !m.hasSelection() && !this.composing ? "block" : "none";
    this.placeIme(caretX, caretV * lh);
    this.placeSuggest(caretX, caretV * lh);
    this.drawMap(total, caretV);
    if (this.onStatus) this.onStatus();
  };

  Editor.prototype.placeIme = function (x, y) {
    var r = this.view.getBoundingClientRect();
    var left = r.left + x - this.view.scrollLeft;
    var top = r.top + y - this.view.scrollTop;
    this.ime.style.height = this.lineHeight + "px";
    this.ime.style.fontSize = this.fontSize + "px";
    this.ime.style.fontFamily = this.fontFamily;
    this.ime.style.lineHeight = this.lineHeight + "px";
    if (!this.composing) this.ime.style.width = "2px";
    if (top < r.top - this.lineHeight || top > r.bottom || left < r.left - 20 || left > r.right) {
      this.ime.style.left = "-2000px";
      return;
    }
    this.ime.style.left = left + "px";
    this.ime.style.top = top + "px";
  };

  Editor.prototype.drawMap = function (total, caretV) {
    if (!this.minimapOn) return;
    var canvas = this.map;
    var w = 72;
    var h = Math.max(40, this.view.clientHeight || 100);
    var dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var bg = getComputedStyle(this.root).getPropertyValue("--ed-bg").trim() || "#fff";
    var fg = getComputedStyle(this.root).getPropertyValue("--ed-fg").trim() || "#888";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    var lines = this.model.lines;
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.55;
    var scale = lines.length / h;
    for (var y = 0; y < h; y++) {
      var line = lines[Math.min(lines.length - 1, Math.floor(y * scale))] || "";
      var len = Math.min(w - 4, Math.ceil(M().visualCols(line.slice(0, 200), this.model.tabSize) * 0.45));
      if (len > 0) ctx.fillRect(2, y, len, 1);
    }
    ctx.globalAlpha = 1;
    var viewLines = Math.max(1, this.view.clientHeight / this.lineHeight);
    var top = (this.view.scrollTop / this.lineHeight) / Math.max(1, total) * h;
    var vh = Math.max(8, viewLines / Math.max(1, total) * h);
    if (top < 0) top = 0;
    if (top > h - 8) top = Math.max(0, h - 8);
    if (top + vh > h) vh = h - top;
    ctx.strokeStyle = "rgba(80,140,220,.9)";
    ctx.strokeRect(0.5, top + 0.5, w - 1, Math.max(1, vh - 1));
    void caretV;
  };

  Editor.prototype.posFromXY = function (x, y) {
    var lh = this.lineHeight;
    var v = Math.floor(y / lh);
    if (v < 0) v = 0;
    var total = this.visualCount();
    if (v >= total) v = total - 1;
    var info = this.infoAt(v);
    var text = this.model.lines[info.line];
    var parts = this.wrap ? this.lineParts(info.line) : [{ from: 0, to: text.length, v: 0 }];
    var part = parts[info.sub] || parts[0];
    var local = Math.max(0, x) / this.asciiW + (part.v || 0);
    var col = M().indexAt(text, local, this.model.tabSize);
    if (col < part.from) col = part.from;
    if (col > part.to) col = part.to;
    return { line: info.line, col: col, vcol: local, sub: info.sub };
  };

  Editor.prototype.onMouse = function (e, down) {
    if (!this.model || this.hexOn) {
      if (this.hexOn) this.onHexMouse(e, down);
      return;
    }
    var r = this.view.getBoundingClientRect();
    var x = e.clientX - r.left + this.view.scrollLeft;
    var y = e.clientY - r.top + this.view.scrollTop;
    if (y < 0) y = 0;
    var pos = this.posFromXY(x, y);
    if (down) {
      if (e.detail === 2) {
        this.model.selectWordAt(pos.line, pos.col);
        this._drag = "lock";
      } else if (e.detail === 3) {
        this.model.selectLine(pos.line);
        this._drag = "lock";
      } else if (e.altKey) {
        var vcol = M().visualOf(this.model.lines[pos.line], pos.col, this.model.tabSize);
        this._drag = "col";
        this._colA = { line: pos.line, vcol: vcol };
        this.model.setColumn({ l1: pos.line, l2: pos.line, v1: vcol, v2: vcol }, pos);
      } else if (e.shiftKey) {
        this._drag = "char";
        this.model.setCursor(pos, true);
      } else {
        this._drag = "char";
        this.model.collapseTo(pos);
      }
      this.updateSuggest();
      return;
    }
    if (this._drag === "lock") { this.updateSuggest(); return; }
    if (this._drag === "col" && this._colA) {
      var vc = M().visualOf(this.model.lines[pos.line], pos.col, this.model.tabSize);
      this.model.setColumn({ l1: this._colA.line, l2: pos.line, v1: this._colA.vcol, v2: vc }, pos);
      this.updateSuggest();
      return;
    }
    if (this._drag === "char") this.model.setCursor(pos, true);
    if (e.clientY < r.top + 24) this.view.scrollTop -= this.lineHeight;
    else if (e.clientY > r.bottom - 24) this.view.scrollTop += this.lineHeight;
    this.updateSuggest();
  };

  Editor.prototype.reveal = function () {
    if (!this.model || this.hexOn) return;
    var m = this.model;
    var v = this.visualIndex(m.cursor.line, m.cursor.col);
    var y = v * this.lineHeight;
    var view = this.view;
    var h = view.clientHeight || 0;
    if (y < view.scrollTop) view.scrollTop = y;
    else if (y + this.lineHeight > view.scrollTop + h) view.scrollTop = y + this.lineHeight - h + 2;
    var x = M().visualOf(m.lines[m.cursor.line], m.cursor.col, m.tabSize) * this.asciiW;
    var w = view.clientWidth || 0;
    if (x < view.scrollLeft + 8) view.scrollLeft = Math.max(0, x - 20);
    else if (x > view.scrollLeft + w - 24) view.scrollLeft = x - w + 40;
    this.schedule();
  };

  Editor.prototype.onKey = function (e) {
    if (this.composing || e.isComposing || e.keyCode === 229) return;
    if (!this.model) return;
    if (this.hexOn) return this.onHexKey(e);
    var m = this.model;
    var ctrl = e.ctrlKey || e.metaKey;
    var key = e.key;
    if (key === "Escape" && this._sug && this._sug.length) {
      this.clearSuggest();
      e.preventDefault();
      return;
    }
    if ((key === "ArrowUp" || key === "ArrowDown") && !ctrl && !e.shiftKey && !e.altKey && this._sug && this._sug.length) {
      var step = key === "ArrowDown" ? 1 : this._sug.length - 1;
      this._sugAt = (this._sugAt + step) % this._sug.length;
      this.paintSuggest();
      e.preventDefault();
      return;
    }
    var nav = key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End" || key === "PageUp" || key === "PageDown" || key === "Backspace" || key === "Delete" || key === "Enter" || key === "Tab" || key === "Insert";
    if (ctrl && !e.altKey && key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End" && key !== "Backspace" && key !== "Delete") return;
    if (!nav && !ctrl) return;
    var handled = true;
    this._revealNext = true;
    if (key === "ArrowLeft") m.move(ctrl ? "wordLeft" : "left", e.shiftKey);
    else if (key === "ArrowRight") m.move(ctrl ? "wordRight" : "right", e.shiftKey);
    else if (key === "ArrowUp") m.move("up", e.shiftKey);
    else if (key === "ArrowDown") m.move("down", e.shiftKey);
    else if (key === "Home") m.move(ctrl ? "docStart" : "home", e.shiftKey);
    else if (key === "End") m.move(ctrl ? "docEnd" : "end", e.shiftKey);
    else if (key === "PageUp") this.page(-1, e.shiftKey);
    else if (key === "PageDown") this.page(1, e.shiftKey);
    else if (key === "Backspace") {
      if (!this.tryPairBackspace()) {
        if (ctrl && !m.hasSelection()) m.move("wordLeft", true);
        m.backspace();
      }
    } else if (key === "Delete") {
      if (ctrl && !m.hasSelection()) m.move("wordRight", true);
      m.deleteForward();
    }
    else if (key === "Enter") this.insertNewline();
    else if (key === "Tab") {
      if (e.shiftKey || !this.acceptSuggest()) m.indent(e.shiftKey ? -1 : 1);
    }
    else if (key === "Insert" && !ctrl) { m.overtype = !m.overtype; m.changed(); }
    else handled = false;
    if (handled) {
      e.preventDefault();
      if (key !== "Tab" || e.shiftKey) this.updateSuggest();
    }
  };

  var PAIRS = {
    "(": ")", "[": "]", "{": "}",
    "\"": "\"", "'": "'", "`": "`",
    "（": "）", "【": "】", "「": "」", "『": "』", "《": "》"
  };
  var CLOSER = {};
  Object.keys(PAIRS).forEach(function (k) { CLOSER[PAIRS[k]] = k; });

  function isWordChar(ch) {
    var c = ch.charCodeAt(0);
    if (c === 95) return true;
    if (c >= 48 && c <= 57) return true;
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) return true;
    if (c >= 0x3400 && c <= 0x4dbf) return true;
    if (c >= 0x4e00 && c <= 0x9fff) return true;
    if (c >= 0x3040 && c <= 0x30ff) return true;
    if (c >= 0xf900 && c <= 0xfaff) return true;
    return false;
  }

  function isCjkChar(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff);
  }

  function canPairBefore(ch) {
    if (!ch) return true;
    if (isWordChar(ch)) return false;
    return true;
  }

  Editor.prototype.tryPair = function (ch) {
    if (this.autoPair === false) return false;
    var m = this.model;
    if (!m || m.readOnly || m.overtype || m.colSel || !ch || ch.length !== 1) return false;
    var open = PAIRS[ch];
    var line = m.lines[m.cursor.line];
    var col = m.cursor.col;
    if (m.hasSelection()) {
      if (!open) return false;
      var range = m.norm();
      var text = m.rangeText(range.a, range.b);
      m.editRange(range.a, range.b, ch + text + open);
      return true;
    }
    var next = col < line.length ? line.charAt(col) : "";
    var prev = col > 0 ? line.charAt(col - 1) : "";
    if (CLOSER[ch] && next === ch) {
      m.move("right", false);
      return true;
    }
    if (!open) return false;
    if (open === ch && isWordChar(prev)) return false;
    if (!canPairBefore(next)) return false;
    m.insertText(ch + open);
    m.move("left", false);
    return true;
  };

  Editor.prototype.tryPairBackspace = function () {
    if (this.autoPair === false) return false;
    var m = this.model;
    if (!m || m.readOnly || m.hasSelection() || m.colSel) return false;
    var line = m.lines[m.cursor.line];
    var col = m.cursor.col;
    if (col <= 0 || col >= line.length) return false;
    var prev = line.charAt(col - 1);
    var next = line.charAt(col);
    if (PAIRS[prev] !== next) return false;
    m.editRange({ line: m.cursor.line, col: col - 1 }, { line: m.cursor.line, col: col + 1 }, "");
    return true;
  };

  Editor.prototype.prefixAt = function () {
    var m = this.model;
    if (!m || m.hasSelection() || m.colSel) return "";
    var line = m.lines[m.cursor.line];
    var col = m.cursor.col;
    if (col < line.length && isWordChar(line.charAt(col))) return "";
    var i = col;
    while (i > 0 && isWordChar(line.charAt(i - 1))) i--;
    return line.slice(i, col);
  };

  Editor.prototype.lexAdd = function (text, dir) {
    var counts = this._lex.counts;
    var i = 0;
    var n = text.length;
    while (i < n) {
      if (!isWordChar(text.charAt(i))) { i++; continue; }
      var j = i + 1;
      while (j < n && isWordChar(text.charAt(j))) j++;
      var len = j - i;
      if (len >= 2 && len <= 40) {
        var w = text.slice(i, j);
        var c = (counts.get(w) || 0) + dir;
        if (c > 0) counts.set(w, c);
        else counts.delete(w);
      }
      i = j;
    }
  };

  Editor.prototype.syncLexLine = function (i) {
    var lex = this._lex;
    var text = this.model.lines[i];
    if (lex.lines[i] === text) return;
    if (lex.lines[i] != null) this.lexAdd(lex.lines[i], -1);
    if (text != null) this.lexAdd(text, 1);
    lex.lines[i] = text;
  };

  Editor.prototype.kickLex = function () {
    var m = this.model;
    if (!m) return;
    if (!this._lex || this._lex.model !== m) {
      this._lex = { model: m, lines: [], counts: new Map(), next: 0, n: -1 };
    }
    var lex = this._lex;
    if (lex.n !== m.lines.length) {
      lex.counts = new Map();
      lex.lines = [];
      lex.next = 0;
      lex.n = m.lines.length;
    }
    var budget = 700;
    var guard = 0;
    while (budget > 0 && lex.next < m.lines.length && guard < 8000) {
      var i = lex.next++;
      if (lex.lines[i] !== m.lines[i]) {
        if (lex.lines[i] != null) this.lexAdd(lex.lines[i], -1);
        this.lexAdd(m.lines[i], 1);
        lex.lines[i] = m.lines[i];
        budget--;
      }
      guard++;
    }
    lex.pending = lex.next < m.lines.length;
    var self = this;
    clearTimeout(this._lexTimer);
    if (lex.pending) {
      this._lexTimer = setTimeout(function () {
        self.kickLex();
        if (self._prefix) self.updateSuggest();
      }, 16);
    }
  };

  Editor.prototype.matchWords = function (prefix) {
    var counts = this._lex && this._lex.counts;
    if (!counts) return [];
    var lower = prefix.toLowerCase();
    var hits = [];
    counts.forEach(function (count, word) {
      if (word.length <= prefix.length || word.length > 40) return;
      if (word.slice(0, prefix.length).toLowerCase() !== lower) return;
      hits.push({ word: word, count: count });
      if (hits.length > 80) {
        hits.sort(rank);
        hits.length = 40;
      }
    });
    function rank(a, b) {
      var ac = a.word.slice(0, prefix.length) === prefix ? 0 : 1;
      var bc = b.word.slice(0, prefix.length) === prefix ? 0 : 1;
      if (ac !== bc) return ac - bc;
      if (b.count !== a.count) return b.count - a.count;
      if (a.word.length !== b.word.length) return a.word.length - b.word.length;
      return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
    }
    hits.sort(rank);
    return hits.slice(0, 8).map(function (h) { return h.word; });
  };

  Editor.prototype.suggestNote = function () {
    var notes = [];
    if (this.doc && this.doc.truncated) notes.push("当前只载入了文件开头，联想也只来自这段已载入的内容，不是全文里出现过的词。");
    if (this._lex && this._lex.pending) notes.push("词语还在统计，目前只根据前 " + this._lex.next + " 行联想，后面的行还没有纳入。");
    return notes.join("");
  };

  Editor.prototype.updateSuggest = function () {
    if (this.autoWord === false || !this.model || this.hexOn || this.composing) {
      this.clearSuggest();
      return;
    }
    var prefix = this.prefixAt();
    var min = prefix && isCjkChar(prefix.charAt(0)) ? 1 : 2;
    if (!prefix || prefix.length < min) {
      this.clearSuggest();
      return;
    }
    this.kickLex();
    var line = this.model.cursor.line;
    if (this._lex && line < this.model.lines.length) this.syncLexLine(line);
    if (prefix !== this._prefix) this._sugAt = 0;
    this._prefix = prefix;
    this._sug = this.matchWords(prefix);
    if (this._sugAt >= this._sug.length) this._sugAt = 0;
    this.paintSuggest();
  };

  Editor.prototype.paintSuggest = function () {
    var box = this.suggest;
    if (!box) return;
    if (!this._sug || !this._sug.length) {
      box.classList.add("hidden");
      return;
    }
    var esc = ND.esc || function (s) {
      return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; });
    };
    var prefix = this._prefix || "";
    var html = "";
    for (var i = 0; i < this._sug.length; i++) {
      var word = this._sug[i];
      var head = esc(word.slice(0, prefix.length));
      var tail = esc(word.slice(prefix.length));
      html += '<div class="sug' + (i === this._sugAt ? " on" : "") + '" data-sug="' + i + '"><span class="w"><b>' + head + "</b>" + tail + "</span>" +
        (i === this._sugAt ? '<span class="k">Tab</span>' : "") + "</div>";
    }
    var note = this.suggestNote();
    if (note) html += '<div class="sug-note">' + esc(note) + "</div>";
    box.innerHTML = html;
    box.classList.remove("hidden");
    var pt = this.caretPoint();
    if (pt) this.placeSuggest(pt.x, pt.y);
  };

  Editor.prototype.caretPoint = function () {
    var m = this.model;
    if (!m) return null;
    var caretV = this.visualIndex(m.cursor.line, m.cursor.col);
    var caretX = M().visualOf(m.lines[m.cursor.line], m.cursor.col, m.tabSize) * this.asciiW;
    if (this.wrap) {
      var cp = this.lineParts(m.cursor.line);
      var sub = caretV - (this._lineVis ? this._lineVis[m.cursor.line] : m.cursor.line);
      if (cp[sub]) caretX = (M().visualOf(m.lines[m.cursor.line], m.cursor.col, m.tabSize) - cp[sub].v) * this.asciiW;
    }
    return { x: caretX, y: caretV * this.lineHeight };
  };

  Editor.prototype.placeSuggest = function (x, y) {
    var box = this.suggest;
    if (!box) return;
    if (!this._sug || !this._sug.length || this.hexOn || this.autoWord === false) {
      box.classList.add("hidden");
      return;
    }
    var r = this.view.getBoundingClientRect();
    var left = r.left + x - this.view.scrollLeft;
    var top = r.top + y - this.view.scrollTop + this.lineHeight;
    box.style.left = Math.max(8, left) + "px";
    box.style.top = top + "px";
    box.classList.remove("hidden");
    var br = box.getBoundingClientRect();
    if (br.right > window.innerWidth - 8) box.style.left = Math.max(8, window.innerWidth - br.width - 8) + "px";
    if (br.bottom > window.innerHeight - 8) box.style.top = Math.max(8, r.top + y - this.view.scrollTop - br.height - 2) + "px";
  };

  Editor.prototype.clearSuggest = function () {
    this._sug = [];
    this._sugAt = 0;
    this._prefix = "";
    if (this.suggest) this.suggest.classList.add("hidden");
  };

  Editor.prototype.acceptSuggest = function () {
    if (this.autoWord === false || !this._sug || !this._sug.length || !this.model) return false;
    var word = this._sug[this._sugAt] || this._sug[0];
    var prefix = this._prefix;
    var m = this.model;
    if (!prefix || !word || m.readOnly) return false;
    var line = m.cursor.line;
    var col = m.cursor.col;
    var start = col - prefix.length;
    if (start < 0) return false;
    var have = m.lines[line].slice(start, col);
    if (have.toLowerCase() !== prefix.toLowerCase()) return false;
    if (word.toLowerCase().indexOf(have.toLowerCase()) !== 0) return false;
    m.editRange({ line: line, col: start }, { line: line, col: col }, word);
    this.clearSuggest();
    return true;
  };

  Editor.prototype.insertNewline = function () {
    var m = this.model;
    if (!m.autoIndent || m.colSel || m.hasSelection()) {
      m.insertText("\n");
      return;
    }
    var line = m.lines[m.cursor.line];
    var col = m.cursor.col;
    var before = line.slice(0, col);
    var after = line.slice(col);
    var ind = (before.match(/^[ \t]*/) || [""])[0];
    var extra = /[{(\[]\s*$/.test(before) ? (m.insertSpaces ? " ".repeat(m.tabSize) : "\t") : "";
    if (extra && /^\s*[}\])]/.test(after)) {
      var closeInd = ind;
      m.insertText("\n" + ind + extra + "\n" + closeInd);
      var target = m.lines[m.cursor.line - 1] ? m.cursor.line - 1 : m.cursor.line;
      m.patchCursor({ line: m.cursor.line - 1, col: m.lines[m.cursor.line - 1].length });
      void target;
      return;
    }
    m.insertText("\n" + ind + extra);
  };

  Editor.prototype.page = function (dir, shift) {
    var m = this.model;
    var page = Math.max(1, Math.floor((this.view.clientHeight || 400) / this.lineHeight) - 2);
    var v = this.visualIndex(m.cursor.line, m.cursor.col) + dir * page;
    if (v < 0) v = 0;
    var total = this.visualCount();
    if (v >= total) v = total - 1;
    var info = this.infoAt(v);
    var col = M().indexAt(m.lines[info.line], m.prefCol, m.tabSize);
    m.setCursor({ line: info.line, col: col }, shift);
    this.reveal();
  };

  Editor.prototype.setMarks = function (list) {
    var map = new Map();
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!map.has(m.line)) map.set(m.line, []);
      map.get(m.line).push(m);
    }
    this.marks = map;
    this.schedule();
  };

  Editor.prototype.copySelection = function () {
    var m = this.model;
    var text = m.selectedText();
    if (!text) text = m.lines[m.cursor.line] + "\n";
    return text;
  };

  Editor.prototype.renderHex = function () {
    if (this.suggest) this.suggest.classList.add("hidden");
    var bytes = this.bytes || new Uint8Array(0);
    var lh = this.lineHeight;
    var bpr = 16;
    var rows = Math.max(1, Math.ceil((bytes.length + 1) / bpr));
    this.gutter.style.width = "0px";
    this.map.style.display = "none";
    this.spacer.style.height = rows * lh + "px";
    this.spacer.style.width = "100%";
    var st = this.view.scrollTop;
    var start = Math.max(0, Math.floor(st / lh) - 2);
    var count = Math.ceil((this.view.clientHeight || 400) / lh) + 6;
    var end = Math.min(rows, start + count);
    var html = "";
    for (var r = start; r < end; r++) {
      var off = r * bpr;
      var hex = "";
      var asc = "";
      for (var c = 0; c < bpr; c++) {
        var i = off + c;
        if (c === 8) hex += " ";
        if (i < bytes.length) {
          var h = bytes[i].toString(16).padStart(2, "0");
          var on = i === this.hexPos ? " class=\"hexcur\"" : "";
          hex += "<span" + on + ">" + h + "</span> ";
          var ch = bytes[i];
          asc += ch >= 32 && ch < 127 ? ND.esc(String.fromCharCode(ch)) : ".";
        } else if (i === bytes.length) {
          hex += "<span class=\"hexcur\">  </span> ";
        } else hex += "   ";
      }
      var head = off.toString(16).padStart(8, "0");
      html += "<div class=\"ed-line hex\" style=\"height:" + lh + "px;transform:translateY(" + ((r - start) * lh) + "px)\"><span class=\"hexoff\">" + head + "</span>  " + hex + " " + asc + "</div>";
    }
    this.gutterWin.innerHTML = "";
    this.codeWin.innerHTML = html;
    this.caret.style.display = "none";
    this.cur.style.display = "none";
    this.ime.style.left = "-2000px";
    if (this.onStatus) this.onStatus();
  };

  Editor.prototype.onHexMouse = function (e, down) {
    if (!down) return;
    var r = this.view.getBoundingClientRect();
    var x = e.clientX - r.left + this.view.scrollLeft;
    var y = e.clientY - r.top + this.view.scrollTop;
    var row = Math.floor(y / this.lineHeight);
    var col = Math.floor(x / this.asciiW);
    var hexStart = 10;
    var rel = col - hexStart;
    if (rel >= 25) rel -= 1;
    var byte = Math.floor(rel / 3);
    if (byte < 0) byte = 0;
    if (byte > 15) byte = 15;
    var idx = row * 16 + byte;
    var len = this.bytes ? this.bytes.length : 0;
    if (idx > len) idx = len;
    this.hexPos = idx;
    this.nibble = 0;
    this.schedule();
  };

  Editor.prototype.onHexKey = function (e) {
    var bytes = this.bytes ? this.bytes : (this.bytes = new Uint8Array(0));
    var key = e.key;
    var handled = true;
    var locked = this.model && this.model.readOnly;
    if (!locked && /^[0-9a-f]$/i.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var val = parseInt(key, 16);
      if (this.hexPos >= bytes.length) {
        var nb = new Uint8Array(bytes.length + 1);
        nb.set(bytes);
        bytes = nb;
        this.bytes = bytes;
        if (this.doc) this.doc.bytes = bytes;
      }
      var b = bytes[this.hexPos] || 0;
      if (this.nibble === 0) bytes[this.hexPos] = (b & 0x0f) | (val << 4);
      else bytes[this.hexPos] = (b & 0xf0) | val;
      if (this.nibble === 0) this.nibble = 1;
      else { this.nibble = 0; this.hexPos++; }
      this.hexDirty = true;
      if (this.onHexDirty) this.onHexDirty();
    } else if (!locked && key === "Backspace") {
      if (this.nibble === 1) this.nibble = 0;
      else if (this.hexPos > 0) { this.hexPos--; this.nibble = 1; }
    } else if (key === "ArrowLeft") {
      if (this.hexPos > 0) this.hexPos--;
      this.nibble = 0;
    } else if (key === "ArrowRight") {
      if (this.hexPos < bytes.length) this.hexPos++;
      this.nibble = 0;
    } else if (key === "ArrowUp") {
      this.hexPos = Math.max(0, this.hexPos - 16);
    } else if (key === "ArrowDown") {
      this.hexPos = Math.min(bytes.length, this.hexPos + 16);
    } else handled = false;
    if (handled) {
      e.preventDefault();
      var row = Math.floor(this.hexPos / 16);
      var y = row * this.lineHeight;
      if (y < this.view.scrollTop) this.view.scrollTop = y;
      else if (y + this.lineHeight > this.view.scrollTop + this.view.clientHeight) this.view.scrollTop = y + this.lineHeight - this.view.clientHeight;
      this.schedule();
    }
  };

  ND.Editor = Editor;
})();
