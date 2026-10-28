var ND = ND || {};

(function () {
  "use strict";

  function setOf(s) {
    var o = Object.create(null);
    if (!s) return o;
    var p = s.split(/\s+/);
    for (var i = 0; i < p.length; i++) if (p[i]) o[p[i]] = 1;
    return o;
  }

  var C_WORDS = "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Bool _Complex _Imaginary";
  var CPP_EXTRA = "alignas alignof and and_eq asm bitand bitor bool catch class compl constexpr consteval constinit decltype delete explicit export false friend inline mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public reinterpret_cast static_assert static_cast template this thread_local throw true try typeid typename using virtual xor xor_eq override final concept requires co_await co_return co_yield char8_t char16_t char32_t wchar_t";
  var JS_WORDS = "break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await enum true false null undefined arguments";
  var PY_WORDS = "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case";

  var LANGS = {
    plaintext: { name: "普通文本", exts: ["txt", "log"], keywords: setOf(""), line: null },
    javascript: { name: "JavaScript", exts: ["js", "mjs", "cjs", "jsx"], keywords: setOf(JS_WORDS), line: "//", block: ["/*", "*/"], strings: ["\"", "'"], template: true },
    typescript: { name: "TypeScript", exts: ["ts", "tsx"], keywords: setOf(JS_WORDS + " type interface implements public private protected readonly declare abstract namespace module infer keyof satisfies as is never unknown any string number boolean object"), line: "//", block: ["/*", "*/"], strings: ["\"", "'"], template: true },
    python: { name: "Python", exts: ["py", "pyw"], keywords: setOf(PY_WORDS), hash: true, triple: true, strings: ["\"", "'"] },
    java: { name: "Java", exts: ["java"], keywords: setOf("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record sealed permits yield"), line: "//", block: ["/*", "*/"], strings: ["\""], types: setOf("String Integer Boolean Long Double Float Short Byte Character Object") },
    c: { name: "C", exts: ["c", "h"], keywords: setOf(C_WORDS), line: "//", block: ["/*", "*/"], strings: ["\"", "'"], pre: true },
    cpp: { name: "C++", exts: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"], keywords: setOf(C_WORDS + " " + CPP_EXTRA), line: "//", block: ["/*", "*/"], strings: ["\"", "'"], pre: true },
    csharp: { name: "C#", exts: ["cs"], keywords: setOf("abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while var async await record init required"), line: "//", block: ["/*", "*/"], strings: ["\"", "'"] },
    go: { name: "Go", exts: ["go"], keywords: setOf("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil"), line: "//", block: ["/*", "*/"], strings: ["\"", "'", "`"] },
    rust: { name: "Rust", exts: ["rs"], keywords: setOf("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while"), line: "//", block: ["/*", "*/"], strings: ["\""] },
    html: { name: "HTML", exts: ["html", "htm", "vue", "svg"], custom: "html" },
    xml: { name: "XML", exts: ["xml", "xsd", "xsl"], custom: "html" },
    css: { name: "CSS", exts: ["css", "scss", "less"], custom: "css" },
    json: { name: "JSON", exts: ["json"], custom: "json" },
    sql: { name: "SQL", exts: ["sql"], keywords: setOf("select from where and or not insert into values update set delete create table drop alter join left right inner outer on as group by order having limit offset union all distinct primary key foreign references index view database use begin commit rollback grant revoke like in is null between exists case when then else end asc desc int integer varchar text boolean date timestamp"), line: "--", block: ["/*", "*/"], strings: ["'", "\""] },
    shell: { name: "Shell", exts: ["sh", "bash", "zsh", "ps1", "bat", "cmd"], keywords: setOf("if then else elif fi for while do done case esac function select in echo exit return local export unset readonly shift source alias cd pwd set eval exec trap true false"), hash: true, strings: ["\"", "'"] },
    yaml: { name: "YAML", exts: ["yml", "yaml"], hash: true, strings: ["\"", "'"], keywords: setOf("true false yes no null") },
    markdown: { name: "Markdown", exts: ["md", "markdown"], custom: "md" },
    tcl: { name: "TCL", exts: ["tcl", "tm"], keywords: setOf("proc if else elseif for foreach while switch break continue return set global variable upvar uplevel expr incr append lappend puts open close gets read source package namespace eval catch error unset rename info string list dict array regexp regsub exec cd pwd file glob after clock interp"), hash: true, strings: ["\""] },
    verilog: { name: "Verilog", exts: ["v", "sv", "svh", "vh"], keywords: setOf("module endmodule input output inout wire reg logic integer real time parameter localparam assign always always_ff always_comb always_latch initial begin end if else case casex casez endcase for while forever repeat posedge negedge or and nand nor xor xnor not buf generate endgenerate genvar function endfunction task endtask return typedef struct enum union packed interface endinterface class endclass package endpackage import extends virtual static automatic signed unsigned"), line: "//", block: ["/*", "*/"], strings: ["\""], pre: true },
    properties: { name: "配置", exts: ["properties", "ini", "cfg", "conf", "toml"], custom: "ini" }
  };

  var EXT = Object.create(null);
  Object.keys(LANGS).forEach(function (id) {
    var exts = LANGS[id].exts || [];
    for (var i = 0; i < exts.length; i++) EXT[exts[i]] = id;
  });

  var FUNCS = {
    javascript: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s*(?:export\s+)?class\s+(\w+)|^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\()/,
    typescript: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)|^\s*(?:export\s+)?interface\s+(\w+)/,
    python: /^\s*(?:async\s+)?def\s+(\w+)|^\s*class\s+(\w+)/,
    java: /^\s*(?:public|private|protected|static|final|native|synchronized|abstract|default|\s)*(?:class|interface|enum|record)\s+(\w+)|^\s*(?:public|private|protected|static|final|synchronized|native|abstract|\s)+[\w.<>,\[\]]+\s+(\w+)\s*\(/,
    c: /^\s*(?:[\w\*]+\s+)+(\w+)\s*\([^;]*\)\s*\{?\s*$/,
    cpp: /^\s*(?:[\w:\*\&\<\>\s]+)\s+(\w+)\s*\([^;]*\)\s*(const)?\s*\{?\s*$|^\s*(?:class|struct|namespace)\s+(\w+)/,
    go: /^\s*func\s+(?:\([^)]+\)\s*)?(\w+)|^\s*type\s+(\w+)/,
    rust: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)|^\s*(?:pub\s+)?struct\s+(\w+)|^\s*(?:pub\s+)?enum\s+(\w+)/,
    tcl: /^\s*proc\s+(\S+)/,
    verilog: /^\s*(?:module|function|task|class|interface)\s+(\w+)/,
    shell: /^\s*(?:function\s+)?(\w+)\s*\(\s*\)\s*\{/,
    csharp: /^\s*(?:public|private|protected|internal|static|sealed|abstract|partial|\s)*(?:class|interface|struct|record|enum)\s+(\w+)/
  };

  function detect(filename) {
    var name = String(filename || "").toLowerCase();
    var dot = name.lastIndexOf(".");
    if (dot < 0) return "plaintext";
    return EXT[name.slice(dot + 1)] || "plaintext";
  }

  function defOf(lang) {
    return LANGS[lang] || LANGS.plaintext;
  }

  function push(tokens, cls, a, b) {
    if (b > a) tokens.push({ from: a, to: b, cls: cls });
  }

  function startsWith(text, i, s) {
    return text.substr(i, s.length) === s;
  }

  function scanString(text, i, quote, triple) {
    var n = text.length;
    if (triple) {
      var end = text.indexOf(quote + quote + quote, i + 3);
      if (end < 0) return { i: n, state: quote === "'" ? 6 : 5 };
      return { i: end + 3, state: 0 };
    }
    var j = i + 1;
    while (j < n) {
      if (text.charAt(j) === "\\") { j += 2; continue; }
      if (text.charAt(j) === quote) return { i: j + 1, state: 0 };
      j++;
    }
    if (quote === "`") return { i: n, state: 4 };
    if (quote === "\"" && triple) return { i: n, state: 5 };
    return { i: n, state: 0 };
  }

  function wordEnd(text, i) {
    var j = i;
    while (j < text.length && /[A-Za-z0-9_$]/.test(text.charAt(j))) j++;
    return j;
  }

  function tokenizePlain(text, state, lang) {
    var def = defOf(lang);
    var tokens = [];
    var i = 0;
    var n = text.length;
    if (state === 1 && def.block) {
      var end = text.indexOf(def.block[1], i);
      if (end < 0) { push(tokens, "com", 0, n); return { tokens: tokens, state: 1 }; }
      end += def.block[1].length;
      push(tokens, "com", 0, end);
      i = end;
      state = 0;
    }
    if (state === 4) {
      var ts = scanString(text, i - 1 < 0 ? 0 : i, "`", false);
      if (i === 0 && text.charAt(0) !== "`") {
        var e4 = text.indexOf("`", 0);
        if (e4 < 0) { push(tokens, "str", 0, n); return { tokens: tokens, state: 4 }; }
        push(tokens, "str", 0, e4 + 1);
        i = e4 + 1;
        state = 0;
      } else {
        push(tokens, "str", 0, ts.i);
        i = ts.i;
        state = ts.state;
      }
    }
    if (state === 5 || state === 6) {
      var q = state === 6 ? "'" : "\"";
      var end3 = text.indexOf(q + q + q, 0);
      if (end3 < 0) { push(tokens, "str", 0, n); return { tokens: tokens, state: state }; }
      push(tokens, "str", 0, end3 + 3);
      i = end3 + 3;
      state = 0;
    }
    while (i < n) {
      var c = text.charAt(i);
      if (def.line && startsWith(text, i, def.line)) { push(tokens, "com", i, n); break; }
      if (def.hash && c === "#" && (i === 0 || /\s/.test(text.charAt(i - 1)))) { push(tokens, "com", i, n); break; }
      if (def.pre && c === "#" && (i === 0 || /^\s*$/.test(text.slice(0, i)))) { push(tokens, "pre", i, n); break; }
      if (def.block && startsWith(text, i, def.block[0])) {
        var be = text.indexOf(def.block[1], i + def.block[0].length);
        if (be < 0) { push(tokens, "com", i, n); return { tokens: tokens, state: 1 }; }
        push(tokens, "com", i, be + def.block[1].length);
        i = be + def.block[1].length;
        continue;
      }
      if (def.triple && (startsWith(text, i, "\"\"\"") || startsWith(text, i, "'''"))) {
        var tq = text.substr(i, 3);
        var te = text.indexOf(tq, i + 3);
        if (te < 0) { push(tokens, "str", i, n); return { tokens: tokens, state: tq.charAt(0) === "'" ? 6 : 5 }; }
        push(tokens, "str", i, te + 3);
        i = te + 3;
        continue;
      }
      if (def.template && c === "`") {
        var sc = scanString(text, i, "`", false);
        push(tokens, "str", i, sc.i);
        i = sc.i;
        if (sc.state) return { tokens: tokens, state: sc.state };
        continue;
      }
      if (def.strings && def.strings.indexOf(c) >= 0) {
        var ss = scanString(text, i, c, false);
        push(tokens, "str", i, ss.i);
        i = ss.i;
        continue;
      }
      if (c >= "0" && c <= "9") {
        var jn = i + 1;
        while (jn < n && /[0-9a-fA-FxX._]/.test(text.charAt(jn))) jn++;
        push(tokens, "num", i, jn);
        i = jn;
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        var we = wordEnd(text, i);
        var w = text.slice(i, we);
        var cls = null;
        if (def.keywords[w]) cls = "kw";
        else if (def.types && def.types[w]) cls = "type";
        else if (text.charAt(we) === "(") cls = "fn";
        if (cls) push(tokens, cls, i, we);
        i = we;
        continue;
      }
      i++;
    }
    return { tokens: tokens, state: state || 0 };
  }

  function tokenizeHtml(text, state) {
    var tokens = [];
    var i = 0;
    var n = text.length;
    if (state === 1) {
      var ce = text.indexOf("-->", 0);
      if (ce < 0) { push(tokens, "com", 0, n); return { tokens: tokens, state: 1 }; }
      push(tokens, "com", 0, ce + 3);
      i = ce + 3;
      state = 0;
    }
    while (i < n) {
      if (startsWith(text, i, "<!--")) {
        var e = text.indexOf("-->", i + 4);
        if (e < 0) { push(tokens, "com", i, n); return { tokens: tokens, state: 1 }; }
        push(tokens, "com", i, e + 3);
        i = e + 3;
        continue;
      }
      if (text.charAt(i) === "<") {
        push(tokens, "op", i, i + 1);
        i++;
        if (text.charAt(i) === "/") { push(tokens, "op", i, i + 1); i++; }
        var ns = i;
        while (i < n && /[A-Za-z0-9:_-]/.test(text.charAt(i))) i++;
        push(tokens, "kw", ns, i);
        while (i < n && text.charAt(i) !== ">") {
          if (text.charAt(i) === "\"" || text.charAt(i) === "'") {
            var q = text.charAt(i);
            var j = text.indexOf(q, i + 1);
            if (j < 0) { push(tokens, "str", i, n); return { tokens: tokens, state: 0 }; }
            push(tokens, "str", i, j + 1);
            i = j + 1;
            continue;
          }
          if (/[A-Za-z_:-]/.test(text.charAt(i))) {
            var as = i;
            while (i < n && /[A-Za-z0-9_:-]/.test(text.charAt(i))) i++;
            push(tokens, "type", as, i);
            continue;
          }
          i++;
        }
        if (text.charAt(i) === ">") { push(tokens, "op", i, i + 1); i++; }
        continue;
      }
      i++;
    }
    return { tokens: tokens, state: 0 };
  }

  function tokenizeCss(text, state) {
    var tokens = [];
    var i = 0;
    var n = text.length;
    if (state === 1) {
      var e = text.indexOf("*/", 0);
      if (e < 0) { push(tokens, "com", 0, n); return { tokens: tokens, state: 1 }; }
      push(tokens, "com", 0, e + 2);
      i = e + 2;
    }
    while (i < n) {
      if (startsWith(text, i, "/*")) {
        var be = text.indexOf("*/", i + 2);
        if (be < 0) { push(tokens, "com", i, n); return { tokens: tokens, state: 1 }; }
        push(tokens, "com", i, be + 2);
        i = be + 2;
        continue;
      }
      var c = text.charAt(i);
      if (c === "\"" || c === "'") {
        var j = i + 1;
        while (j < n && text.charAt(j) !== c) { if (text.charAt(j) === "\\") j++; j++; }
        push(tokens, "str", i, Math.min(n, j + 1));
        i = Math.min(n, j + 1);
        continue;
      }
      if (c === "#" || c === ".") {
        var k = i + 1;
        while (k < n && /[A-Za-z0-9_-]/.test(text.charAt(k))) k++;
        push(tokens, "fn", i, k);
        i = k;
        continue;
      }
      if (/[0-9]/.test(c)) {
        var m = i + 1;
        while (m < n && /[0-9.%a-zA-Z-]/.test(text.charAt(m))) m++;
        push(tokens, "num", i, m);
        i = m;
        continue;
      }
      if (/[A-Za-z_-]/.test(c)) {
        var w = i + 1;
        while (w < n && /[A-Za-z0-9_-]/.test(text.charAt(w))) w++;
        var word = text.slice(i, w);
        if (/^(important|from|to)$/.test(word) || text.charAt(w) === ":") push(tokens, "kw", i, w);
        i = w;
        continue;
      }
      i++;
    }
    return { tokens: tokens, state: 0 };
  }

  function tokenizeJson(text) {
    var tokens = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      var c = text.charAt(i);
      if (c === "\"" ) {
        var j = i + 1;
        while (j < n) {
          if (text.charAt(j) === "\\") { j += 2; continue; }
          if (text.charAt(j) === "\"") { j++; break; }
          j++;
        }
        var key = text.charAt(j) === ":";
        var k2 = j;
        while (k2 < n && /\s/.test(text.charAt(k2))) k2++;
        push(tokens, text.charAt(k2) === ":" ? "type" : "str", i, j);
        i = j;
        continue;
      }
      if (c >= "0" && c <= "9" || c === "-") {
        var m = i + 1;
        while (m < n && /[0-9.eE+-]/.test(text.charAt(m))) m++;
        push(tokens, "num", i, m);
        i = m;
        continue;
      }
      if (/[a-z]/.test(c)) {
        var w = wordEnd(text, i);
        var word = text.slice(i, w);
        if (word === "true" || word === "false" || word === "null") push(tokens, "kw", i, w);
        i = w;
        continue;
      }
      i++;
    }
    return { tokens: tokens, state: 0 };
  }

  function tokenizeMd(text) {
    var tokens = [];
    var n = text.length;
    if (/^\s*#/.test(text)) push(tokens, "kw", 0, n);
    else if (/^\s*>/.test(text)) push(tokens, "com", 0, n);
    else if (/^\s*```/.test(text)) push(tokens, "str", 0, n);
    else if (/^\s*[-*]\s/.test(text)) push(tokens, "fn", 0, Math.min(n, text.indexOf(" ") + 1));
    var i = 0;
    while (i < n) {
      if (text.charAt(i) === "`") {
        var j = text.indexOf("`", i + 1);
        if (j < 0) break;
        push(tokens, "str", i, j + 1);
        i = j + 1;
        continue;
      }
      i++;
    }
    return { tokens: tokens, state: 0 };
  }

  function tokenizeIni(text) {
    var tokens = [];
    var t = text.trim();
    if (!t) return { tokens: tokens, state: 0 };
    if (t.charAt(0) === "#" || t.charAt(0) === ";") { push(tokens, "com", 0, text.length); return { tokens: tokens, state: 0 }; }
    if (t.charAt(0) === "[") { push(tokens, "kw", 0, text.length); return { tokens: tokens, state: 0 }; }
    var eq = text.indexOf("=");
    if (eq < 0) eq = text.indexOf(":");
    if (eq > 0) {
      push(tokens, "type", 0, eq);
      push(tokens, "str", eq + 1, text.length);
    }
    return { tokens: tokens, state: 0 };
  }

  function tokenize(text, state, lang) {
    var def = defOf(lang);
    if (def.custom === "html") return tokenizeHtml(text, state || 0);
    if (def.custom === "css") return tokenizeCss(text, state || 0);
    if (def.custom === "json") return tokenizeJson(text);
    if (def.custom === "md") return tokenizeMd(text);
    if (def.custom === "ini") return tokenizeIni(text);
    return tokenizePlain(text, state || 0, lang);
  }

  function lineComment(lang) {
    var d = defOf(lang);
    if (d.line) return d.line;
    if (d.hash) return "#";
    if (lang === "properties") return "#";
    if (lang === "sql") return "--";
    return null;
  }

  function blockComment(lang) {
    var d = defOf(lang);
    return d.block || null;
  }

  function listFunctions(lang, lines) {
    var re = FUNCS[lang];
    var out = [];
    if (!re) return out;
    var limit = Math.min(lines.length, 30000);
    for (var i = 0; i < limit; i++) {
      var m = lines[i].match(re);
      if (!m) continue;
      var name = "";
      for (var k = 1; k < m.length; k++) if (m[k]) { name = m[k]; break; }
      if (!name) continue;
      var kind = /^\s*(class|interface|module|struct|enum|type|record)/.test(lines[i]) ? "class" : "fn";
      out.push({ line: i, name: name, kind: kind });
    }
    return out;
  }

  function listLanguages() {
    return Object.keys(LANGS).map(function (id) { return { id: id, name: LANGS[id].name }; });
  }

  ND.Highlight = {
    tokenize: tokenize,
    detect: detect,
    lineComment: lineComment,
    blockComment: blockComment,
    listFunctions: listFunctions,
    listLanguages: listLanguages,
    nameOf: function (lang) { return defOf(lang).name; }
  };

  ND.esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&amp;";
      if (c === "<") return "&lt;";
      if (c === ">") return "&gt;";
      return "&quot;";
    });
  };
})();
