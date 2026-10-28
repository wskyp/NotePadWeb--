/* global ND */
(function (root) {
  "use strict";

  var ND = root.ND = root.ND || {};
  var seen = Object.create(null);

  var ALIAS = {
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "typescript",
    py: "python",
    sh: "shell", bash: "shell", zsh: "shell", ps1: "shell",
    yml: "yaml",
    md: "markdown",
    htm: "html",
    cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp",
    "c++": "cpp"
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&amp;";
      if (c === "<") return "&lt;";
      if (c === ">") return "&gt;";
      return "&quot;";
    });
  }

  function safeUrl(url) {
    var u = String(url || "").trim();
    if (!u || /[\u0000-\u001f\s]/.test(u)) return "";
    if (u.indexOf("//") === 0) return "";
    if (/^data:/i.test(u)) return /^data:image\/[a-z0-9.+-]+;/i.test(u) ? u : "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {
      if (/^(https?:|mailto:)/i.test(u)) return u;
      return "";
    }
    return u;
  }

  function imageHtml(alt, url) {
    var safe = safeUrl(url);
    var a = esc(alt);
    if (!safe) return a;
    if (/^(https?:|data:image\/)/i.test(safe)) return '<img src="' + esc(safe) + '" alt="' + a + '">';
    return '<img alt="' + a + '" data-rel="' + esc(safe) + '">';
  }

  function linkHtml(inner, url) {
    var safe = safeUrl(url);
    if (!safe) return inner;
    if (/^(https?:|mailto:)/i.test(safe)) {
      return '<a href="' + esc(safe) + '" target="_blank" rel="noopener">' + inner + "</a>";
    }
    if (safe.charAt(0) === "#") return '<a href="' + esc(safe) + '">' + inner + "</a>";
    return '<a href="#" data-rel="' + esc(safe) + '">' + inner + "</a>";
  }

  function inline(text) {
    var slots = [];
    function keep(html) {
      slots.push(html);
      return "\u0001" + (slots.length - 1) + "\u0001";
    }
    var s = String(text);
    s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|>~])/g, function (_, c) { return keep(esc(c)); });
    s = s.replace(/(`+)([^`\n]*?)\1/g, function (_, ticks, body) {
      return keep("<code>" + esc(body) + "</code>");
    });
    var dest = "\\(\\s*<?([^\\s>()]+(?:\\([^\\s>()]*\\)[^\\s>()]*)*)>?(?:\\s+(?:\"[^\"]*\"|'[^']*'))?\\s*\\)";
    s = s.replace(new RegExp("!\\[([^\\]]*)\\]" + dest, "g"), function (_, alt, url) {
      return keep(imageHtml(alt, url));
    });
    s = s.replace(new RegExp("\\[([^\\]]+)\\]" + dest, "g"), function (_, label, url) {
      return keep(linkHtml(inline(label), url));
    });
    s = s.replace(/<(https?:\/\/[^>\s]+)>/g, function (_, url) {
      return keep(linkHtml(esc(url), url));
    });
    s = esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(\[>"'\u0001])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/(^|[\s(\[>"'\u0001])_([^_\n]+)_/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    s = s.replace(/(^|[\s>(])((https?:\/\/|mailto:)[^\s<]+)/g, function (_, pre, url) {
      var clean = url.replace(/[),.;:!?]+$/, "");
      return pre + linkHtml(esc(clean), clean) + url.slice(clean.length);
    });
    return s.replace(/\u0001(\d+)\u0001/g, function (_, n) { return slots[Number(n)]; });
  }

  function slug(html) {
    var t = String(html).replace(/<[^>]+>/g, "");
    t = t.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    t = t.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u4e00-\u9fff_-]/g, "");
    if (!t) t = "section";
    var id = t;
    if (seen[id]) {
      seen[id]++;
      id = t + "-" + seen[id];
    } else seen[id] = 1;
    return id;
  }

  function heading(level, inner) {
    return "<h" + level + ' id="' + slug(inner) + '">' + inner + "</h" + level + ">";
  }

  function paint(text, tokens) {
    if (!tokens || !tokens.length) return esc(text);
    var list = tokens.slice().sort(function (a, b) { return a.from - b.from; });
    var html = "";
    var at = 0;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.from < at || t.to <= t.from) continue;
      html += esc(text.slice(at, t.from));
      html += '<span class="' + t.cls + '">' + esc(text.slice(t.from, t.to)) + "</span>";
      at = t.to;
    }
    return html + esc(text.slice(at));
  }

  function highlight(code, lang) {
    lang = String(lang || "").trim().toLowerCase().split(/\s+/)[0].replace(/^\./, "");
    if (!lang || !ND.Highlight) return esc(code);
    lang = ALIAS[lang] || lang;
    var lines = String(code).split("\n");
    var state = 0;
    var html = [];
    for (var i = 0; i < lines.length; i++) {
      var r;
      try { r = ND.Highlight.tokenize(lines[i], state, lang); }
      catch (e) { return esc(code); }
      state = r.state || 0;
      html.push(paint(lines[i], r.tokens));
    }
    return html.join("\n");
  }

  function listMarker(line) {
    var m = String(line).match(/^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/);
    if (!m) return null;
    var indent = m[1].replace(/\t/g, "    ").length;
    return { indent: indent, ordered: /\d/.test(m[2]), text: m[3] };
  }

  function isHr(line) {
    return /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
  }

  function blockStart(line) {
    if (isHr(line)) return true;
    if (/^ {0,3}(```+|~~~+)/.test(line)) return true;
    if (/^ {0,3}#{1,6}\s+/.test(line)) return true;
    if (/^ {0,3}>/.test(line)) return true;
    if (listMarker(line)) return true;
    return false;
  }

  function isTable(lines, i) {
    if (i + 1 >= lines.length) return false;
    if (lines[i].indexOf("|") < 0) return false;
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1]);
  }

  function splitRow(line) {
    var s = String(line).trim();
    if (s.charAt(0) === "|") s = s.slice(1);
    if (s.charAt(s.length - 1) === "|") s = s.slice(0, -1);
    return s.split("|").map(function (c) { return c.trim(); });
  }

  function readTable(lines, i) {
    var head = splitRow(lines[i]);
    var aligns = splitRow(lines[i + 1]).map(function (c) {
      var left = c.charAt(0) === ":";
      var right = c.charAt(c.length - 1) === ":";
      if (left && right) return "center";
      if (right) return "right";
      return "left";
    });
    i += 2;
    var body = [];
    while (i < lines.length && lines[i].indexOf("|") >= 0 && lines[i].trim() && !blockStart(lines[i])) {
      body.push(splitRow(lines[i]));
      i++;
    }
    function cell(tag, text, n) {
      var al = aligns[n] && aligns[n] !== "left" ? ' style="text-align:' + aligns[n] + '"' : "";
      return "<" + tag + al + ">" + inline(text || "") + "</" + tag + ">";
    }
    var h = "<tr>" + head.map(function (c, n) { return cell("th", c, n); }).join("") + "</tr>";
    var b = body.map(function (row) {
      return "<tr>" + head.map(function (_, n) { return cell("td", row[n] || "", n); }).join("") + "</tr>";
    }).join("");
    return { html: "<table><thead>" + h + "</thead><tbody>" + b + "</tbody></table>", next: i };
  }

  function readList(lines, i) {
    var first = listMarker(lines[i]);
    var ordered = first.ordered;
    var base = first.indent;
    var items = [];
    while (i < lines.length) {
      var m = listMarker(lines[i]);
      if (!m || m.indent !== base || m.ordered !== ordered) break;
      var text = m.text;
      i++;
      var cont = [];
      while (i < lines.length && lines[i].trim() && !blockStart(lines[i])) {
        var pad = lines[i].match(/^\s*/)[0].replace(/\t/g, "    ").length;
        if (pad <= base) break;
        cont.push(lines[i].trim());
        i++;
      }
      var nested = "";
      if (i < lines.length) {
        var sub = listMarker(lines[i]);
        if (sub && sub.indent > base) {
          var built = readList(lines, i);
          nested = built.html;
          i = built.next;
        }
      }
      var body;
      var task = text.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        body = '<input type="checkbox" disabled' + (task[1].toLowerCase() === "x" ? " checked" : "") + "> " + inline(task[2]);
      } else body = inline(text);
      if (cont.length) body += " " + cont.map(inline).join(" ");
      items.push("<li>" + body + nested + "</li>");
    }
    var tag = ordered ? "ol" : "ul";
    return { html: "<" + tag + ">" + items.join("") + "</" + tag + ">", next: i };
  }

  function joinPara(rows) {
    var bits = [];
    for (var i = 0; i < rows.length; i++) {
      if (i > 0) bits.push(/\s{2}$/.test(rows[i - 1]) || /\\$/.test(rows[i - 1]) ? "<br>" : " ");
      bits.push(inline(rows[i].replace(/[ \t]{2,}$/, "").replace(/\\$/, "")));
    }
    return bits.join("");
  }

  function render(src) {
    var lines = String(src == null ? "" : src).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var i = 0;
    var out = [];
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }

      var fence = line.match(/^ {0,3}(```+|~~~+)(.*)$/);
      if (fence) {
        var mark = fence[1].charAt(0);
        var flen = fence[1].length;
        var lang = fence[2].trim();
        var buf = [];
        i++;
        while (i < lines.length) {
          var close = lines[i].match(/^ {0,3}(```+|~~~+)\s*$/);
          if (close && close[1].charAt(0) === mark && close[1].length >= flen) { i++; break; }
          buf.push(lines[i]);
          i++;
        }
        out.push("<pre><code>" + highlight(buf.join("\n"), lang) + "</code></pre>");
        continue;
      }

      var atx = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (atx) {
        out.push(heading(atx[1].length, inline(atx[2])));
        i++;
        continue;
      }

      if (i + 1 < lines.length && line.trim() && !isHr(line) && /^ {0,3}=+\s*$/.test(lines[i + 1])) {
        out.push(heading(1, inline(line.trim())));
        i += 2;
        continue;
      }
      if (i + 1 < lines.length && line.trim() && !isHr(line) && /^ {0,3}-+\s*$/.test(lines[i + 1])) {
        out.push(heading(2, inline(line.trim())));
        i += 2;
        continue;
      }

      if (isHr(line)) { out.push("<hr>"); i++; continue; }

      if (/^ {0,3}>/.test(line)) {
        var quote = [];
        while (i < lines.length && (/^ {0,3}>/.test(lines[i]) || (quote.length && lines[i].trim() && !blockStart(lines[i])))) {
          quote.push(lines[i].replace(/^ {0,3}>\s?/, ""));
          i++;
          if (i < lines.length && !lines[i].trim()) {
            if (i + 1 < lines.length && /^ {0,3}>/.test(lines[i + 1])) { quote.push(""); i++; }
            else break;
          }
        }
        out.push("<blockquote>" + render(quote.join("\n")) + "</blockquote>");
        continue;
      }

      if (isTable(lines, i)) {
        var table = readTable(lines, i);
        out.push(table.html);
        i = table.next;
        continue;
      }

      if (listMarker(line)) {
        var list = readList(lines, i);
        out.push(list.html);
        i = list.next;
        continue;
      }

      var para = [];
      while (i < lines.length && lines[i].trim() && !blockStart(lines[i]) && !isTable(lines, i)) {
        if (para.length && i + 1 < lines.length && /^ {0,3}(=+|-+)\s*$/.test(lines[i + 1]) && !isHr(lines[i])) break;
        para.push(lines[i]);
        i++;
      }
      if (para.length) out.push("<p>" + joinPara(para) + "</p>");
    }
    return out.join("\n");
  }

  function toHtml(src) {
    seen = Object.create(null);
    return render(src);
  }

  ND.Markdown = { toHtml: toHtml };
})(typeof window !== "undefined" ? window : this);
