/* global ND */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $("#app");
  var state = {
    docs: [],
    active: null,
    workspace: null,
    roots: [],
    side: "tree",
    seq: 1,
    nid: 1,
    nodeMap: new Map(),
    find: { query: "", replace: "", case: false, word: false, regex: false, wrap: true, mark: true },
    compare: null,
    compIndex: 0,
    findJob: 0,
    treeHidden: 0
  };
  var settings = loadSettings();
  ND.macro = { rec: false, play: false, ops: [] };

  hookProto("insertText");
  hookProto("backspace");
  hookProto("deleteForward");
  hookProto("move");

  var editor = new ND.Editor($("#editorHost"));
  editor.onContext = function (x, y) { editorMenu(x, y); };
  editor.onStatus = function () { paintStatus(); paintDirty(); updateHint(); refreshMd(); };
  editor.onHexDirty = function () {
    if (state.active) state.active.hexDirty = true;
    paintDirty();
  };

  var ICONS = {
    brand: '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1.5" y="1" width="13" height="14" rx="1" fill="#fff" stroke="#2b78c5"/><path d="M4 5h8M4 8h8M4 11h5" stroke="#2b78c5"/></svg>',
    new: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 1h7l3 3v11H3z" fill="#fff" stroke="#333"/><path d="M10 1v3h3" fill="none" stroke="#333"/><path d="M8 7v5M5.5 9.5h5" stroke="#2b78c5"/></svg>',
    open: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M1 4h5l1 2h8v7H1z" fill="#f6c445" stroke="#a57a12"/></svg>',
    save: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 1h8l3 3v11H3z" fill="#4aa3ff"/><path d="M5 1v4h6V1M5 15v-5h7v5" fill="#fff"/></svg>',
    saveall: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 3h7l2 2v8H2z" fill="#4aa3ff"/><path d="M6 2h7l2 2v8h-2" fill="none" stroke="#1d4e89"/></svg>',
    undo: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M6 4L2 7l4 3V8h5a3 3 0 010 6H8" fill="none" stroke="#333" stroke-width="1.4"/></svg>',
    redo: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M10 4l4 3-4 3V8H5a3 3 0 000 6h3" fill="none" stroke="#333" stroke-width="1.4"/></svg>',
    cut: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="4" cy="4" r="2" fill="none" stroke="#333"/><circle cx="4" cy="12" r="2" fill="none" stroke="#333"/><path d="M6 5l7-3M6 11l7 3M8 8l5 0" stroke="#333"/></svg>',
    copy: '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="5" y="3" width="8" height="10" fill="#fff" stroke="#333"/><rect x="3" y="5" width="8" height="10" fill="#e8f2ff" stroke="#333"/></svg>',
    paste: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M5 2h4l1 2h3v10H3V4h2z" fill="#fff7d6" stroke="#333"/></svg>',
    find: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="7" cy="7" r="4" fill="none" stroke="#333"/><path d="M10 10l4 4" stroke="#c47d15" stroke-width="1.6"/></svg>',
    replace: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 4h8M8 2l3 2-3 2M14 12H6M8 10l-3 2 3 2" fill="none" stroke="#333" stroke-width="1.3"/></svg>',
    wrap: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 3h12M2 7h8a3 3 0 010 6H8" fill="none" stroke="#333"/><path d="M8 11l-2 2 2 2" fill="none" stroke="#333"/></svg>',
    ws: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 12h10M5 4v5M8 6v3M11 4v5" stroke="#333"/></svg>',
    hex: '<svg viewBox="0 0 16 16" width="16" height="16"><text x="1" y="12" font-size="9" fill="#333">16</text></svg>',
    compare: '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1" y="2" width="6" height="12" fill="#ffd0d0" stroke="#333"/><rect x="9" y="2" width="6" height="12" fill="#d8ffd8" stroke="#333"/></svg>',
    md: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M1 3h14v10H1z" fill="#fff" stroke="#333"/><path d="M3 11V5l2 3 2-3v6M11 11V5h2" fill="none" stroke="#2b78c5" stroke-width="1.2"/></svg>'
  };

  var MENUS = [
    { name: "文件", items: [
      ["新建", "Ctrl+N", "new"],
      ["打开文件…", "Ctrl+O", "openFile"],
      ["打开文件夹…", "Ctrl+Alt+O", "openFolder"],
      ["移除全部文件夹", "", "closeFolders"],
      ["打开示例", "", "sample"],
      "sep",
      ["保存", "Ctrl+S", "save"],
      ["另存为…", "Ctrl+Shift+S", "saveAs"],
      ["全部保存", "Ctrl+Shift+A", "saveAll"],
      "sep",
      ["关闭", "Ctrl+W", "close"],
      ["全部关闭", "", "closeAll"],
      ["打印", "Ctrl+P", "print"]
    ]},
    { name: "编辑", items: [
      ["撤销", "Ctrl+Z", "undo"],
      ["重做", "Ctrl+Y", "redo"],
      "sep",
      ["剪切", "Ctrl+X", "cut"],
      ["复制", "Ctrl+C", "copy"],
      ["粘贴", "Ctrl+V", "paste"],
      ["全选", "Ctrl+A", "selectAll"],
      "sep",
      ["复制当前行", "Ctrl+D", "dupLine"],
      ["删除当前行", "Ctrl+Shift+L", "delLine"],
      ["上移当前行", "Alt+Up", "moveUp"],
      ["下移当前行", "Alt+Down", "moveDown"],
      "sep",
      ["行注释", "Ctrl+/", "comment"],
      ["块注释", "Ctrl+Shift+/", "blockComment"],
      { label: "转换大小写", sub: [["大写", "Ctrl+Shift+U", "upper"], ["小写", "Ctrl+U", "lower"], ["标题化", "", "title"]] },
      { label: "行编辑", sub: [
        ["去除行尾空白", "", "trim"],
        ["删除空行", "", "emptyLines"],
        ["升序", "", "sortAsc"],
        ["降序", "", "sortDesc"],
        ["反转", "", "reverse"],
        ["去重", "", "unique"]
      ]}
    ]},
    { name: "搜索", items: [
      ["查找…", "Ctrl+F", "find"],
      ["替换…", "Ctrl+H", "replace"],
      ["在文件中查找…", "Ctrl+Shift+F", "findFiles"],
      ["查找下一个", "F3", "findNext"],
      ["查找上一个", "Shift+F3", "findPrev"],
      ["跳转到行…", "Ctrl+G", "goto"],
      "sep",
      ["标记全部", "Ctrl+F3", "markAll"],
      ["切换书签", "Ctrl+F2", "bookmark"],
      ["下一书签", "F2", "nextBm"],
      ["上一书签", "Shift+F2", "prevBm"],
      ["清除书签", "", "clearBm"],
      ["匹配括号", "Ctrl+B", "bracket"]
    ]},
    { name: "视图", items: [
      ["自动换行", "", "wrap", "wrap"],
      ["显示空白字符", "", "ws", "showWs"],
      ["缩略图", "", "minimap", "minimap"],
      ["代码折叠", "", "folding", "folding"],
      ["显示侧栏", "", "sidebar", "sidebar"],
      ["显示工具栏", "", "toolbar", "toolbar"],
      ["显示状态栏", "", "statusbar", "statusbar"],
      "sep",
      ["放大", "Ctrl+=", "zoomIn"],
      ["缩小", "Ctrl+-", "zoomOut"],
      ["重置缩放", "Ctrl+0", "zoomReset"],
      ["全屏", "F11", "fullscreen"],
      "sep",
      { label: "Markdown", sub: [
        ["源码", "", "md:off"],
        ["源码与预览", "Ctrl+Shift+M", "md:split"],
        ["仅预览", "", "md:preview"]
      ]},
      ["十六进制", "", "hex"],
      ["只读", "", "readonly"]
    ]},
    { name: "编码", items: [
      ["UTF-8", "", "enc:utf-8"],
      ["UTF-8 BOM", "", "enc:utf-8-bom"],
      ["GBK", "", "enc:gbk"],
      ["GB18030", "", "enc:gb18030"],
      ["UTF-16 LE", "", "enc:utf-16le"],
      "sep",
      ["用 UTF-8 重新打开", "", "reopen:utf-8"],
      ["用 GBK 重新打开", "", "reopen:gbk"],
      ["用 UTF-16 LE 重新打开", "", "reopen:utf-16le"]
    ]},
    { name: "语言", items: [] },
    { name: "设置", items: [
      ["首选项…", "", "settings"],
      ["括号自动补全", "", "autoPair", "autoPair"],
      ["词语联想", "", "autoWord", "autoWord"],
      { label: "主题", sub: [
        ["经典亮色", "", "theme:classic"],
        ["深色", "", "theme:dark"],
        ["Monokai", "", "theme:monokai"],
        ["Lavender", "", "theme:lavender"],
        ["Yellow Rice", "", "theme:yellow"],
        ["Solarized", "", "theme:solarized"]
      ]}
    ]},
    { name: "宏", items: [
      ["开始录制", "Ctrl+Shift+R", "macroRec"],
      ["停止录制", "", "macroStop"],
      ["播放", "Ctrl+Shift+P", "macroPlay"],
      ["清空", "", "macroClear"]
    ]},
    { name: "工具", items: [
      ["MD5", "", "md5"],
      ["SHA-256", "", "sha"],
      ["Base64", "", "base64"],
      ["URL 编解码", "", "url"],
      ["JSON 格式化", "", "jsonfmt"],
      ["XML 格式化", "", "xmlfmt"],
      ["统计", "", "stats"]
    ]},
    { name: "对比", items: [
      ["对比文件…", "", "compare"],
      ["与打开时的内容比较", "", "compareDisk"],
      ["对比文件夹…", "", "compareFolder"]
    ]},
    { name: "窗口", items: [
      ["下一个标签", "Ctrl+PageDown", "nextTab"],
      ["上一个标签", "Ctrl+PageUp", "prevTab"],
      ["文档列表", "", "showDocs"],
      ["函数列表", "", "showFuncs"]
    ]},
    { name: "帮助", items: [
      ["快捷键", "", "shortcuts"],
      ["关于 NotePadWeb--", "", "about"]
    ]}
  ];

  ND.Highlight.listLanguages().forEach(function (lang) {
    MENUS[5].items.push([lang.name, "", "lang:" + lang.id]);
  });

  function hookProto(name) {
    var raw = ND.DocModel.prototype[name];
    ND.DocModel.prototype[name] = function () {
      if (ND.macro.rec && !ND.macro.play) ND.macro.ops.push({ name: name, args: Array.prototype.slice.call(arguments) });
      return raw.apply(this, arguments);
    };
  }

  function loadSettings() {
    var defaults = {
      theme: "classic", fontSize: 14,
      fontFamily: 'Consolas, "Cascadia Mono", "Microsoft YaHei Mono", monospace',
      tabSize: 4, insertSpaces: false, autoIndent: true,
      autoPair: true, autoWord: true,
      showWs: false, wrap: false, minimap: true, folding: true,
      sidebar: true, toolbar: true, statusbar: true, mdView: "split"
    };
    try {
      var saved = JSON.parse(localStorage.getItem("notepadmm.settings") || "null");
      if (saved) Object.keys(defaults).forEach(function (k) { if (saved[k] != null) defaults[k] = saved[k]; });
    } catch (e) { /* ignore */ }
    return defaults;
  }

  function saveSettings() {
    localStorage.setItem("notepadmm.settings", JSON.stringify(settings));
  }

  function svgWrap(name) { return ICONS[name] || ""; }

  function buildMenus() {
    var bar = $("#menubar");
    bar.innerHTML = MENUS.map(function (menu) {
      return '<div class="menu"><button type="button" class="menu-title">' + menu.name + '</button><div class="menu-pop">' + itemsHtml(menu.items) + "</div></div>";
    }).join("");
  }

  function itemsHtml(items) {
    return items.map(function (it) {
      if (it === "sep") return '<div class="sep"></div>';
      if (it.sub) {
        return '<div class="menu-item has-sub"><span>' + it.label + '</span><span>▸</span><div class="menu-pop">' + itemsHtml(it.sub) + "</div></div>";
      }
      var check = it[3] ? '<span class="check" data-flag="' + it[3] + '"></span>' : "";
      return '<div class="menu-item" data-act="' + it[2] + '">' + check + "<span>" + it[0] + '</span><span class="accel">' + (it[1] || "") + "</span></div>";
    }).join("");
  }

  function buildToolbar() {
    var specs = [
      ["brand", ""],
      ["new", "新建 (Ctrl+N)", "new"],
      ["open", "打开文件夹", "openFolder"],
      ["save", "保存 (Ctrl+S)", "save"],
      ["saveall", "全部保存", "saveAll"],
      "sep",
      ["undo", "撤销", "undo"],
      ["redo", "重做", "redo"],
      "sep",
      ["cut", "剪切", "cut"],
      ["copy", "复制", "copy"],
      ["paste", "粘贴", "paste"],
      "sep",
      ["find", "查找", "find"],
      ["replace", "替换", "replace"],
      "sep",
      ["wrap", "自动换行", "wrap"],
      ["ws", "显示空白", "ws"],
      ["hex", "十六进制", "hex"],
      ["md", "Markdown 预览", "md:toggle"],
      ["compare", "对比文件", "compare"]
    ];
    $("#toolbar").innerHTML = specs.map(function (s) {
      if (s === "sep") return '<i class="tb-sep"></i>';
      if (s[0] === "brand") return '<span class="brand">' + svgWrap("brand") + "NotePadWeb--</span>";
      return '<button type="button" class="tb" data-act="' + s[2] + '" title="' + s[1] + '">' + svgWrap(s[0]) + "</button>";
    }).join("") + '<span class="path-crumb" id="crumb"></span>';
  }

  function accelMatch(e, accel) {
    if (!accel) return false;
    var parts = accel.split("+");
    var key = parts.pop();
    var ctrl = parts.indexOf("Ctrl") >= 0;
    var shift = parts.indexOf("Shift") >= 0;
    var alt = parts.indexOf("Alt") >= 0;
    if (!!(e.ctrlKey || e.metaKey) !== ctrl) return false;
    if (!!e.shiftKey !== shift) return false;
    if (!!e.altKey !== alt) return false;
    if (key === "Plus" || key === "=") return e.key === "=" || e.key === "+";
    if (key === "-") return e.key === "-" || e.key === "_";
    if (key === "/") return e.key === "/" || e.key === "?";
    if (key === "0") return e.key === "0";
    if (key.length === 1) return e.key.toLowerCase() === key.toLowerCase();
    return e.key === key;
  }

  function isField(el) {
    if (!el || el === editor.ime) return false;
    var tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  }

  function active() { return state.active; }

  function createDoc(name) {
    var doc = {
      id: state.seq++,
      name: name || "未命名-" + state.seq,
      path: "",
      handle: null,
      file: null,
      parent: null,
      encoding: "utf-8",
      eol: "\r\n",
      language: "plaintext",
      hex: false,
      bytes: null,
      originalBytes: null,
      hexPos: 0,
      hexDirty: false,
      readOnly: false,
      model: new ND.DocModel([""])
    };
    doc.model.tabSize = settings.tabSize;
    doc.model.insertSpaces = settings.insertSpaces;
    doc.model.autoIndent = settings.autoIndent;
    return doc;
  }

  function activate(doc) {
    if (state.active && state.active !== doc) stash(state.active);
    state.active = doc;
    if (!doc) return;
    doc.model.tabSize = settings.tabSize;
    doc.model.insertSpaces = settings.insertSpaces;
    doc.model.autoIndent = settings.autoIndent;
    doc.model.readOnly = !!doc.readOnly;
    editor.tabSize = settings.tabSize;
    editor.bind(doc);
    editor.wrap = !!settings.wrap && !doc.noWrap;
    editor.focus();
    closeCompare();
    renderTabs();
    renderSide();
    paintStatus();
    updateHint();
    $("#crumb").textContent = doc.path || doc.name;
    document.title = (doc.model.dirty() || doc.hexDirty ? "*" : "") + doc.name + " - NotePadWeb--";
    refreshMd();
  }

  function stash(doc) {
    doc.hex = editor.hexOn;
    doc.bytes = editor.bytes;
    doc.hexPos = editor.hexPos;
    doc.hexDirty = editor.hexDirty;
  }

  function renderTabs() {
    $("#tabs").innerHTML = state.docs.map(function (d) {
      var dirty = d.model.dirty() || d.hexDirty;
      return '<div class="tab' + (d === state.active ? " on" : "") + (dirty ? " dirty" : "") + '" data-id="' + d.id + '" title="' + ND.esc(d.path || d.name) + '"><span class="star">' + (dirty ? "●" : "") + '</span><span class="name">' + ND.esc(d.name) + '</span><button type="button" class="x" data-x="' + d.id + '">×</button></div>';
    }).join("");
  }

  function paintDirty() {
    var d = active();
    if (!d) return;
    var dirty = d.model.dirty() || d.hexDirty || editor.hexDirty;
    document.title = (dirty ? "*" : "") + d.name + " - NotePadWeb--";
    var tab = $('.tab[data-id="' + d.id + '"]');
    if (!tab) return;
    tab.classList.toggle("dirty", dirty);
    var star = tab.querySelector(".star");
    if (star) star.textContent = dirty ? "●" : "";
  }

  function updateHint() {
    var d = active();
    var show = d && !d.hex && !editor.hexOn && d.model.text() === "" && !d.model.dirty() && state.docs.length === 1;
    $("#hint").classList.toggle("hidden", !show);
  }

  function docById(id) {
    id = Number(id);
    for (var i = 0; i < state.docs.length; i++) if (state.docs[i].id === id) return state.docs[i];
    return null;
  }

  function addDoc(doc, silent) {
    state.docs.push(doc);
    if (!silent) activate(doc);
    else renderTabs();
  }

  async function closeDoc(doc) {
    if (!doc) return;
    var dirty = doc.model.dirty() || doc.hexDirty;
    if (dirty) {
      var answer = await ask(doc.name, "文件已修改，是否保存？", [
        ["cancel", "取消"],
        ["discard", "不保存"],
        ["save", "保存", true]
      ]);
      if (answer !== "save" && answer !== "discard") return;
      if (answer === "save") {
        var ok = await saveDoc(doc);
        if (!ok) return;
      }
    }
    var idx = state.docs.indexOf(doc);
    if (idx >= 0) state.docs.splice(idx, 1);
    if (!state.docs.length) addDoc(createDoc("未命名-1"));
    else if (state.active === doc) activate(state.docs[Math.max(0, idx - 1)]);
    else renderTabs();
  }

  var TREE_DRAW_CAP = 800;
  var TEXT_PLAIN_BYTES = 1500000;
  var TEXT_CUT_BYTES = 2000000;
  var TEXT_HEAD_BYTES = 1024 * 1024;
  var HEX_WINDOW_BYTES = 1024 * 1024;
  var WRAP_LINE_CAP = 20000;
  var FIND_HIT_CAP = 400;
  var COMPARE_LINE_CAP = 20000;
  var FOLDER_ROW_CAP = 1500;
  var SKIP_DIR = {
    node_modules: 1, ".git": 1, dist: 1, target: 1, ".idea": 1, __pycache__: 1,
    vendor: 1, build: 1, out: 1, coverage: 1, ".svn": 1, ".hg": 1, ".vs": 1, bower_components: 1
  };

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
    return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
  }

  function yieldUI() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function skipDirName(name) {
    if (!name || name === "." || name === "..") return false;
    if (SKIP_DIR[name]) return true;
    return name.charAt(0) === ".";
  }

  function pathHasSkip(path, keepHead) {
    var parts = String(path || "").split("/");
    var start = keepHead ? 1 : 0;
    for (var i = start; i < parts.length - 1; i++) if (skipDirName(parts[i])) return true;
    return false;
  }

  async function readFileSlice(file, start, end) {
    var size = typeof file.size === "number" ? file.size : 0;
    var blob = file.slice(start, Math.min(end, size));
    return new Uint8Array(await blob.arrayBuffer());
  }

  function snapHeadBytes(bytes, total) {
    if (bytes.length >= total) return bytes;
    var cut = bytes.length;
    var from = Math.max(0, bytes.length - 8192);
    for (var i = bytes.length - 1; i >= from; i--) {
      if (bytes[i] === 10) { cut = i; break; }
    }
    if (cut < 3) cut = bytes.length;
    var slice = bytes.subarray(0, cut);
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(slice);
      return slice;
    } catch (e) {
      var n = slice.length;
      while (n > 0 && n > slice.length - 4) {
        n--;
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(slice.subarray(0, n));
          return slice.subarray(0, n);
        } catch (err) { /* keep trimming a partial code unit */ }
      }
      return slice;
    }
  }

  function truncationText(d) {
    var t = d.truncated;
    var how = t.kind === "hex" ? "十六进制视图只显示开头 " : "文本只显示开头 ";
    return "大文件提醒：" + d.name + " 共 " + formatBytes(t.total) + "。当前" + how + formatBytes(t.shown) + "，后面的内容没有载入。屏幕上看到的不是全文。直接保存已禁止，以免用这段开头覆盖原文件里尚未载入的部分。";
  }

  function paintFileWarn() {
    var el = $("#fileWarn");
    if (!el) return;
    var d = active();
    var lines = [];
    if (d && d.truncated) lines.push(truncationText(d));
    if (d && d.noWrap && settings.wrap) lines.push("这个文件有 " + d.model.lines.length + " 行，自动换行已暂停，避免把每一行都拆开重排。");
    if (!lines.length) { el.classList.add("hidden"); el.textContent = ""; return; }
    el.textContent = lines.join("\n");
    el.classList.remove("hidden");
  }

  function looksBinary(bytes) {
    var n = Math.min(bytes.length, 8192);
    var odd = 0;
    for (var i = 0; i < n; i++) {
      if (bytes[i] === 0) return true;
      if (bytes[i] < 9 || (bytes[i] > 13 && bytes[i] < 32)) odd++;
    }
    return n > 0 && odd / n > 0.08;
  }

  async function openFileObject(file, extra) {
    extra = extra || {};
    var total = typeof file.size === "number" ? file.size : -1;
    var bytes;
    var truncated = null;
    var forceHex = false;
    if (total < 0) {
      bytes = new Uint8Array(await file.arrayBuffer());
      total = bytes.length;
    }
    var probe = bytes || await readFileSlice(file, 0, Math.min(total, 8192));
    var binary = looksBinary(probe);
    if (!bytes && binary && total > TEXT_CUT_BYTES) {
      var hexN = Math.min(total, HEX_WINDOW_BYTES);
      bytes = await readFileSlice(file, 0, hexN);
      forceHex = true;
      if (bytes.length < total) truncated = { total: total, shown: bytes.length, mode: "head", kind: "hex" };
    } else if (!bytes && total > TEXT_CUT_BYTES) {
      bytes = snapHeadBytes(await readFileSlice(file, 0, Math.min(total, TEXT_HEAD_BYTES)), total);
      if (bytes.length < total) truncated = { total: total, shown: bytes.length, mode: "head", kind: "text" };
    } else if (!bytes) {
      bytes = await readFileSlice(file, 0, total);
      if (!binary && bytes.length > probe.length) binary = looksBinary(bytes);
    }
    var doc = createDoc(file.name);
    doc.file = file;
    doc.path = extra.path || file.webkitRelativePath || file.name;
    doc.handle = extra.handle || null;
    doc.parent = extra.parent || null;
    doc.originalBytes = bytes;
    doc.bytes = bytes;
    doc.totalSize = total;
    doc.truncated = truncated;
    if (forceHex || binary) {
      doc.hex = true;
      doc.binary = binary;
      doc.language = "plaintext";
    }
    if (!doc.hex) {
      var dec = ND.codec.decodeBytes(bytes);
      var split = ND.codec.splitText(dec.text);
      doc.encoding = dec.encoding;
      doc.eol = split.eol;
      doc.language = ND.Highlight.detect(file.name);
      if (truncated || bytes.length > TEXT_PLAIN_BYTES) doc.language = "plaintext";
      doc.model.setText(split.lines.join("\n"));
      doc.model.markClean();
      doc.baseText = truncated || bytes.length > TEXT_PLAIN_BYTES ? null : doc.model.text();
      if (doc.model.lines.length > WRAP_LINE_CAP) doc.noWrap = true;
    }
    if (truncated) {
      doc.readOnly = true;
      doc.model.readOnly = true;
    }
    addDoc(doc);
    if (doc.binary && !truncated) toast("检测为二进制，已用十六进制打开");
    paintFileWarn();
  }

  async function openHandle(handle, parent, path) {
    var file = await handle.getFile();
    await openFileObject(file, { handle: handle, parent: parent, path: path || handle.name });
  }

  function currentBytes(doc) {
    if (doc === state.active && editor.hexOn) return editor.bytes || new Uint8Array(0);
    if (doc.hex) return doc.bytes || new Uint8Array(0);
    var text = ND.codec.joinEol(doc.model.lines, doc.eol);
    return ND.codec.encodeText(text, doc.encoding);
  }

  async function saveDoc(doc, saveAs) {
    if (!doc) return false;
    if (doc.truncated && !saveAs) {
      toast("当前只载入了文件开头，直接保存会覆盖尚未载入的内容，已取消。");
      paintFileWarn();
      return false;
    }
    if (doc.truncated && saveAs) {
      var allow = await ask("只保存已载入的开头", "编辑器里不是完整文件。另存为只会写出已显示的开头 " + formatBytes(doc.truncated.shown) + "，原文件共 " + formatBytes(doc.truncated.total) + "。", [["cancel", "取消"], ["ok", "仍要另存为", true]]);
      if (allow !== "ok") return false;
    }
    if (doc === state.active) stash(doc);
    var packed = doc.hex || (doc === state.active && editor.hexOn)
      ? { bytes: (doc === state.active ? editor.bytes : doc.bytes) || new Uint8Array(0), missing: [] }
      : ND.codec.encodeText(ND.codec.joinEol(doc.model.lines, doc.eol), doc.encoding);
    if (packed.missing && packed.missing.length) {
      var go = await ask("无法用 " + doc.encoding + " 保存", "有 " + packed.missing.slice(0, 8).join(" ") + " 等字符不在该编码中。改用 UTF-8 保存？", [["cancel", "取消"], ["ok", "UTF-8 保存", true]]);
      if (go !== "ok") return false;
      doc.encoding = "utf-8";
      packed = ND.codec.encodeText(ND.codec.joinEol(doc.model.lines, doc.eol), "utf-8");
    }
    var bytes = packed.bytes;
    try {
      if (!saveAs && doc.handle && doc.handle.createWritable) {
        var stream = await doc.handle.createWritable();
        await stream.write(bytes);
        await stream.close();
        finishSave(doc, bytes);
        toast("已保存 " + doc.name);
        return true;
      }
      if (window.showSaveFilePicker && window.isSecureContext) {
        var handle = await window.showSaveFilePicker({ suggestedName: doc.name });
        var w = await handle.createWritable();
        await w.write(bytes);
        await w.close();
        doc.handle = handle;
        doc.name = handle.name;
        doc.path = handle.name;
        var partialPick = !!doc.truncated;
        if (saveAs && partialPick) releaseTruncation(doc);
        finishSave(doc, bytes);
        toast(partialPick ? "已另存为已载入的开头。新文件只包含这部分，不是原来的完整文件。" : "已保存 " + doc.name);
        renderTabs();
        paintFileWarn();
        return true;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return false;
      toast("保存失败：" + (err.message || err));
    }
    var partialDownload = !!doc.truncated;
    download(bytes, doc.name);
    if (saveAs && partialDownload) releaseTruncation(doc);
    finishSave(doc, bytes);
    paintFileWarn();
    toast(partialDownload ? "已下载已载入的开头。这份文件不是原来的完整文件。" : "浏览器不能写回原路径，已下载 " + doc.name);
    return true;
  }

  function releaseTruncation(doc) {
    doc.truncated = null;
    doc.readOnly = false;
    if (doc.model) doc.model.readOnly = false;
    doc.totalSize = doc.bytes ? doc.bytes.length : doc.totalSize;
  }

  function finishSave(doc, bytes) {
    doc.model.markClean();
    doc.hexDirty = false;
    doc.originalBytes = bytes;
    doc.baseText = doc.hex ? doc.baseText : doc.model.text();
    if (doc === state.active) editor.hexDirty = false;
    paintDirty();
    paintStatus();
  }

  function download(bytes, name) {
    var blob = new Blob([bytes], { type: "application/octet-stream" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name || "untitled.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  async function openFolder() {
    if (window.showDirectoryPicker && window.isSecureContext) {
      try {
        var dir = await window.showDirectoryPicker({ mode: "readwrite" });
        var root = { nid: state.nid++, name: dir.name, kind: "dir", handle: dir, children: null, expanded: true, parent: null };
        await loadChildren(root);
        await addRoot(root);
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    $("#dirOpen").click();
  }

  async function loadChildren(node) {
    if (!node.handle || node.kind !== "dir") return;
    var kids = [];
    var iter = node.handle.entries();
    while (true) {
      var step = await iter.next();
      if (step.done) break;
      var name = step.value[0];
      var handle = step.value[1];
      kids.push({
        nid: state.nid++,
        name: name,
        kind: handle.kind === "directory" ? "dir" : "file",
        handle: handle,
        parent: node,
        children: handle.kind === "directory" ? null : undefined,
        expanded: false
      });
    }
    sortNodes(kids);
    node.children = kids;
  }

  function sortNodes(nodes) {
    nodes.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, "zh");
    });
  }

  function isRoot(node) {
    return !!(node && state.roots.indexOf(node) >= 0);
  }

  async function alreadyOpen(root) {
    for (var i = 0; i < state.roots.length; i++) {
      var old = state.roots[i];
      if (root.handle && old.handle && old.handle.isSameEntry) {
        try { if (await old.handle.isSameEntry(root.handle)) return old; } catch (e) { /* ignore */ }
      }
    }
    return null;
  }

  async function addRoot(root, extra) {
    var same = await alreadyOpen(root);
    if (same) {
      same.expanded = true;
      renderSide();
      toast(same.name + " 已经在侧栏里");
      return false;
    }
    root.parent = null;
    root.expanded = true;
    state.roots.push(root);
    state.workspace = state.roots[0];
    renderSide();
    var msg = state.roots.length === 1 ? "已打开 " + root.name : "已再打开 " + root.name + "，侧栏共 " + state.roots.length + " 个目录";
    if (extra) msg += "。" + extra;
    toast(msg);
    return true;
  }

  function removeRoot(node) {
    state.roots = state.roots.filter(function (r) { return r !== node; });
    state.workspace = state.roots[0] || null;
    renderSide();
    toast("已从侧栏移除 " + node.name + (state.roots.length ? "，还剩 " + state.roots.length + " 个目录" : ""));
  }

  function closeFolders() {
    if (!state.roots.length) { toast("侧栏里没有文件夹"); return; }
    state.roots = [];
    state.workspace = null;
    renderSide();
    toast("已从侧栏移除全部文件夹，已经打开的文档还在");
  }

  function workspaceFromFiles(files) {
    var rootName = files[0].webkitRelativePath.split("/")[0] || "文件夹";
    var root = { nid: state.nid++, name: rootName, kind: "dir", children: [], expanded: true };
    files.forEach(function (file) {
      var parts = (file.webkitRelativePath || file.name).split("/");
      var node = root;
      for (var i = 1; i < parts.length; i++) {
        var last = i === parts.length - 1;
        var name = parts[i];
        var child = null;
        for (var k = 0; k < node.children.length; k++) if (node.children[k].name === name) child = node.children[k];
        if (!child) {
          child = {
            nid: state.nid++,
            name: name,
            kind: last ? "file" : "dir",
            children: last ? undefined : [],
            file: last ? file : null,
            parent: node,
            expanded: false
          };
          node.children.push(child);
        }
        node = child;
      }
    });
    (function sortRec(n) {
      if (!n.children) return;
      sortNodes(n.children);
      n.children.forEach(sortRec);
    })(root);
    addRoot(root, "这次读入 " + files.length + " 个文件");
  }

  function renderSide() {
    var host = $("#sideBody");
    var q = ($("#treeFilter").value || "").trim().toLowerCase();
    if (state.side === "docs") {
      host.innerHTML = state.docs.map(function (d) {
        return '<div class="doc-item' + (d === state.active ? " on" : "") + '" data-doc="' + d.id + '"><span>' + (d.model.dirty() ? "● " : "") + ND.esc(d.name) + "</span></div>";
      }).join("") || '<div class="tree-empty">没有打开的文档</div>';
      return;
    }
    if (state.side === "funcs") {
      var d = active();
      if (!d || d.hex) { host.innerHTML = '<div class="tree-empty">当前文档没有函数列表</div>'; return; }
      var fns = ND.Highlight.listFunctions(d.language, d.model.lines);
      host.innerHTML = fns.map(function (f) {
        return '<div class="fn-item" data-line="' + f.line + '"><span class="k">' + (f.kind === "class" ? "class" : "fn") + "</span><span>" + ND.esc(f.name) + "</span></div>";
      }).join("") || '<div class="tree-empty">没有识别到函数或类</div>';
      return;
    }
    if (!state.roots.length) {
      host.innerHTML = '<div class="tree-empty">尚未打开文件夹。<br>可以多次使用「打开文件夹」或把目录拖进来，侧栏会同时保留这些目录。</div>';
      return;
    }
    state.nodeMap = new Map();
    state.treeHidden = 0;
    var budget = { left: TREE_DRAW_CAP };
    var tree = renderNodes(state.roots, 0, q, budget);
    if (state.treeHidden > 0) {
      tree = '<div class="tree-warn">目录项很多，侧栏这次只画出了前 ' + TREE_DRAW_CAP + " 项，还有 " + state.treeHidden + " 项已经读到但没有显示。列表不是完整目录，可用上方筛选缩小范围。</div>" + tree;
    }
    host.innerHTML = tree;
  }

  function countLoaded(nodes) {
    var n = 0;
    if (!nodes) return 0;
    for (var i = 0; i < nodes.length; i++) {
      n++;
      var c = nodes[i];
      if (c.kind === "dir" && c.expanded && c.children) n += countLoaded(c.children);
    }
    return n;
  }

  function renderNodes(nodes, depth, q, budget) {
    var html = "";
    for (var i = 0; i < nodes.length; i++) {
      if (budget.left <= 0) {
        state.treeHidden += countLoaded(nodes.slice(i));
        break;
      }
      var n = nodes[i];
      state.nodeMap.set(n.nid, n);
      var match = !q || n.name.toLowerCase().indexOf(q) >= 0;
      var childHtml = "";
      if (n.kind === "dir" && n.expanded && n.children) childHtml = renderNodes(n.children, depth + 1, q, budget);
      if (!match && !childHtml) continue;
      budget.left--;
      var twist = n.kind === "dir" ? (n.expanded ? "▾" : "▸") : "";
      var icon = n.kind === "dir" ? "📁" : fileIcon(n.name);
      var rootCls = isRoot(n) ? " root" : "";
      var closer = isRoot(n) ? '<button type="button" class="root-x" data-remove-root="' + n.nid + '" title="从侧栏移除">×</button>' : "";
      html += '<div class="node' + rootCls + '" data-nid="' + n.nid + '" style="padding-left:' + (6 + depth * 14) + 'px"><span class="tw">' + twist + "</span><span>" + icon + '</span><span class="nname">' + ND.esc(n.name) + "</span>" + closer + "</div>" + childHtml;
    }
    return html;
  }

  function fileIcon(name) {
    var ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "js" || ext === "ts") return "🟨";
    if (ext === "py") return "🐍";
    if (ext === "html" || ext === "htm") return "🟧";
    if (ext === "css") return "🟦";
    if (ext === "json") return "🟩";
    if (ext === "md") return "📝";
    return "📄";
  }

  async function onTreeClick(nid) {
    var node = state.nodeMap.get(Number(nid));
    if (!node) return;
    if (node.kind === "dir") {
      node.expanded = !node.expanded;
      if (node.expanded && node.children == null && node.handle) {
        await loadChildren(node);
      }
      renderSide();
      return;
    }
    if (node.handle) await openHandle(node.handle, node.parent, nodePath(node));
    else if (node.file) await openFileObject(node.file, { parent: node.parent, path: node.file.webkitRelativePath || node.name });
  }

  function nodePath(node) {
    var parts = [node.name];
    var p = node.parent;
    while (p) { parts.unshift(p.name); p = p.parent; }
    return parts.join("/");
  }

  function treeMenu(x, y, node) {
    var items = [];
    if (node.kind === "file") items.push(["打开", "openNode"]);
    if (node.handle && (isRoot(node) || (node.parent && node.parent.handle))) {
      items.push(["新建文件…", "newInDir"]);
      if (node.kind === "dir") items.push(["新建文件夹…", "newDir"]);
      if (!isRoot(node)) {
        items.push(["重命名…", "renameNode"]);
        items.push(["删除", "deleteNode"]);
      }
    }
    items.push(["复制路径", "copyNodePath"]);
    items.push(["刷新", "refreshNode"]);
    if (isRoot(node)) items.push(["从侧栏移除", "removeRoot"]);
    popup(x, y, items, async function (act) {
      if (act === "openNode" && node.kind === "file") await onTreeClick(node.nid);
      if (act === "copyNodePath") copyText(nodePath(node));
      if (act === "refreshNode" && node.kind === "dir" && node.handle) { await loadChildren(node); renderSide(); }
      if (act === "removeRoot") removeRoot(node);
      if (act === "newInDir") await createIn(node.kind === "dir" ? node : node.parent, false);
      if (act === "newDir") await createIn(node.kind === "dir" ? node : node.parent, true);
      if (act === "renameNode") await renameNode(node);
      if (act === "deleteNode") await deleteNode(node);
    });
  }

  async function createIn(dir, folder) {
    if (!dir || !dir.handle) { toast("这个目录是只读打开的，不能新建"); return; }
    var name = await promptText(folder ? "新建文件夹" : "新建文件", folder ? "new-folder" : "untitled.txt");
    if (!name) return;
    if (folder) await dir.handle.getDirectoryHandle(name, { create: true });
    else {
      var handle = await dir.handle.getFileHandle(name, { create: true });
      await openHandle(handle, dir, nodePath(dir) + "/" + name);
    }
    await loadChildren(dir);
    dir.expanded = true;
    renderSide();
  }

  async function renameNode(node) {
    var name = await promptText("重命名", node.name);
    if (!name || name === node.name) return;
    if (node.handle.move) {
      await node.handle.move(name);
      node.name = name;
      renderSide();
      return;
    }
    toast("当前浏览器不支持重命名");
  }

  async function deleteNode(node) {
    if (!node.parent || !node.parent.handle) return;
    var ok = await ask("删除", "删除 " + node.name + " ？", [["cancel", "取消"], ["ok", "删除", true]]);
    if (ok !== "ok") return;
    await node.parent.handle.removeEntry(node.name, { recursive: node.kind === "dir" });
    await loadChildren(node.parent);
    renderSide();
  }

  function editorMenu(x, y) {
    popup(x, y, [
      ["剪切", "cut"], ["复制", "copy"], ["粘贴", "paste"], "sep",
      ["全选", "selectAll"], ["行注释", "comment"], ["切换书签", "bookmark"], "sep",
      ["大写", "upper"], ["小写", "lower"], ["十六进制", "hex"]
    ], function (act) { run(act); });
  }

  function popup(x, y, items, onPick) {
    var el = $("#popup");
    el.innerHTML = items.map(function (it) {
      if (it === "sep") return '<div class="sep"></div>';
      return '<div class="menu-item" data-pick="' + it[1] + '"><span>' + it[0] + "</span></div>";
    }).join("");
    el.classList.remove("hidden");
    el.style.left = Math.min(x, window.innerWidth - 200) + "px";
    el.style.top = Math.min(y, window.innerHeight - 40) + "px";
    el.onclick = function (e) {
      var item = e.target.closest("[data-pick]");
      el.classList.add("hidden");
      if (item) onPick(item.getAttribute("data-pick"));
    };
  }

  function paintStatus() {
    var d = active();
    if (!d) { $("#status").innerHTML = ""; paintFileWarn(); return; }
    var m = d.model;
    var lenLabel;
    if (d.truncated) lenLabel = "已显示开头 " + formatBytes(d.truncated.shown) + " / 共 " + formatBytes(d.truncated.total);
    else if (m.lines.length > WRAP_LINE_CAP) lenLabel = m.lines.length + " 行";
    else lenLabel = String(m.text().length);
    var line = m.cursor.line + 1;
    var col = ND.metrics.visualOf(m.lines[m.cursor.line], m.cursor.col, m.tabSize) + 1;
    var selSpan = 0;
    if (m.hasSelection() && !m.colSel) {
      var rng = m.norm();
      selSpan = rng.b.line - rng.a.line;
    }
    var sel = selSpan > 3000 ? "多行" : String(m.selectedText().length);
    var eol = d.eol === "\r\n" ? "Windows (CRLF)" : d.eol === "\r" ? "Mac (CR)" : "Unix (LF)";
    var enc = ({ "utf-8": "UTF-8", "utf-8-bom": "UTF-8 BOM", gbk: "GBK", gb18030: "GB18030", "utf-16le": "UTF-16 LE" })[d.encoding] || d.encoding;
    var lang = ND.Highlight.nameOf(d.language);
    var mode = editor.hexOn ? "十六进制" : (m.overtype ? "改写" : "插入");
    var macro = ND.macro.rec ? "录制中 " + ND.macro.ops.length : "";
    var cut = d.truncated ? " 已截断" : "";
    $("#status").innerHTML =
      '<span class="st">长度: ' + lenLabel + "</span>" +
      '<span class="st">行: ' + line + "</span>" +
      '<span class="st">列: ' + col + "</span>" +
      '<span class="st">选中: ' + sel + "</span>" +
      '<span class="st grow">' + macro + cut + (d.readOnly ? " 只读" : "") + "</span>" +
      '<button type="button" class="st btn" data-act="eolMenu">' + eol + "</button>" +
      '<button type="button" class="st btn" data-act="encMenu">' + enc + "</button>" +
      '<button type="button" class="st btn" data-act="langMenu">' + lang + "</button>" +
      '<button type="button" class="st btn" data-act="overtype">' + mode + "</button>";
    paintFileWarn();
  }

  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.add("hidden"); }, 2600);
  }

  function ask(title, message, buttons) {
    return dialog({ title: title, body: "<p>" + ND.esc(message) + "</p>", buttons: buttons });
  }

  function promptText(title, value) {
    return new Promise(function (resolve) {
      dialog({
        title: title,
        body: '<div class="field"><span>名称</span><input id="dlgInput" value="' + ND.esc(value || "") + '"></div>',
        buttons: [["cancel", "取消"], ["ok", "确定", true]],
        init: function () { var input = $("#dlgInput"); input.focus(); input.select(); }
      }).then(function (id) { resolve(id === "ok" ? $("#dlgInput").value : ""); });
    });
  }

  var dialogResolve = null;
  function dialog(opts) {
    var el = $("#modal");
    el.innerHTML = '<header>' + ND.esc(opts.title) + '</header><div class="body">' + opts.body +
      '<div class="modal-actions">' + (opts.buttons || []).map(function (b) {
        return '<button type="button" class="btn' + (b[2] ? " primary" : "") + '" data-dlg="' + b[0] + '">' + b[1] + "</button>";
      }).join("") + "</div></div>";
    el.classList.remove("hidden");
    if (opts.init) opts.init();
    return new Promise(function (resolve) { dialogResolve = resolve; });
  }

  function closeDialog(id) {
    $("#modal").classList.add("hidden");
    if (dialogResolve) { var fn = dialogResolve; dialogResolve = null; fn(id); }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast("已复制"); }, function () { fallbackCopy(text); });
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var ime = editor.ime;
    ime.value = text;
    ime.focus();
    ime.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ime.value = "";
    toast(ok ? "已复制" : "复制失败");
  }

  function openFind(replace) {
    state.find._replace = !!replace;
    var f = state.find;
    var el = $("#findDlg");
    el.innerHTML =
      '<header>查找 / 替换</header><div class="body">' +
      '<div class="find-grid"><label>查找</label><input id="findQ" type="search" value="' + ND.esc(f.query) + '">' +
      '<label>替换</label><input id="findR" type="text" value="' + ND.esc(f.replace) + '"></div>' +
      '<div class="checks">' +
      check("findCase", "区分大小写", f.case) + check("findWord", "全词匹配", f.word) +
      check("findRe", "正则", f.regex) + check("findWrap", "循环", f.wrap) + check("findMark", "高亮全部", f.mark) +
      "</div><div class=\"find-actions\">" +
      '<button type="button" class="btn" data-fact="next">下一个</button>' +
      '<button type="button" class="btn" data-fact="prev">上一个</button>' +
      '<button type="button" class="btn" data-fact="one">替换</button>' +
      '<button type="button" class="btn" data-fact="all">全部替换</button>' +
      '<button type="button" class="btn" data-fact="count">计数</button>' +
      '<button type="button" class="btn" data-fact="files">在文件中查找</button>' +
      '<button type="button" class="btn" data-fact="close">关闭</button>' +
      "</div></div>";
    el.classList.remove("hidden");
    var q = $("#findQ");
    q.focus();
    q.select();
  }

  function check(id, label, on) {
    return '<label><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "> " + label + "</label>";
  }

  function readFind() {
    var q = $("#findQ");
    if (!q) return state.find;
    state.find.query = q.value;
    state.find.replace = $("#findR").value;
    state.find.case = $("#findCase").checked;
    state.find.word = $("#findWord").checked;
    state.find.regex = $("#findRe").checked;
    state.find.wrap = $("#findWrap").checked;
    state.find.mark = $("#findMark").checked;
    return state.find;
  }

  function findOpts() {
    var f = readFind();
    return { query: f.query, replace: f.replace, case: f.case, word: f.word, regex: f.regex, wrap: f.wrap };
  }

  function applyMarks() {
    var d = active();
    if (!d || editor.hexOn) return;
    var f = state.find;
    if (!f.mark || !f.query) { editor.setMarks([]); return; }
    if (d.model.lines.length > WRAP_LINE_CAP) { editor.setMarks([]); return; }
    var res = d.model.findAll(findOpts(), 8000);
    if (res.error) { toast("正则错误：" + res.error); editor.setMarks([]); return; }
    editor.setMarks(res.matches);
    if (res.capped) toast("匹配很多，高亮只标了前 8000 处，后面的匹配没有标出。");
  }

  function doFind(dir) {
    var d = active();
    if (!d || editor.hexOn) return;
    var opts = findOpts();
    if (!opts.query) return openFind(false);
    var res = d.model.findNext(opts, dir);
    if (res.error) { toast(res.error); return; }
    if (!res.found) { toast("找不到 " + opts.query); editor.setMarks([]); return; }
    editor._revealNext = true;
    editor.reveal();
    applyMarks();
    if (res.partial && res.count == null) toast("已找到。文件较大，没有统计全部匹配数量，高亮也没有铺满全文。");
    else if (res.partial) toast((res.index + 1) + " / 至少 " + res.count + "。后面的匹配没有继续统计。");
    else toast((res.index + 1) + " / " + res.count);
  }

  async function ensureTree(node, job) {
    if (!node || node.kind !== "dir") return;
    if (job != null && job !== state.findJob) return;
    if (!isRoot(node) && skipDirName(node.name)) return;
    if (node.children == null && node.handle) await loadChildren(node);
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (i % 40 === 0) await yieldUI();
      if (job != null && job !== state.findJob) return;
      if (kids[i].kind === "dir") await ensureTree(kids[i], job);
    }
  }

  async function findInFiles() {
    var opts = findOpts();
    if (!opts.query) return openFind(false);
    if (!state.roots.length) { toast("先打开文件夹"); return; }
    var job = ++state.findJob;
    var hits = [];
    var skippedDirs = 0;
    var skippedBig = 0;
    var scanned = 0;
    var capped = false;
    var stopNote = "";
    showPanel("正在查找…", '<div class="result-warn">正在逐层查看目录。关闭结果面板会停止查找。</div>');
    await yieldUI();
    async function walk(node) {
      if (job !== state.findJob || capped) return;
      if (node.kind === "dir") {
        if (!isRoot(node) && skipDirName(node.name)) { skippedDirs++; return; }
        if (node.children == null && node.handle) await loadChildren(node);
        var kids = node.children || [];
        for (var i = 0; i < kids.length; i++) {
          if (i % 25 === 0) {
            $("#panelTitle").textContent = "正在查找… 已看 " + scanned + " 个文件";
            await yieldUI();
            if (job !== state.findJob) return;
          }
          await walk(kids[i]);
          if (capped || job !== state.findJob) return;
        }
        return;
      }
      scanned++;
      var text = await readNode(node);
      if (text == null) { skippedBig++; return; }
      var lines = text.split("\n");
      for (var ln = 0; ln < lines.length; ln++) {
        var ok = false;
        if (opts.regex) {
          try { ok = new RegExp(opts.query, opts.case ? "" : "i").test(lines[ln]); }
          catch (e) { toast(e.message); stopNote = "正则有误，查找已停在这里：" + e.message; capped = true; return; }
        } else {
          var hay = opts.case ? lines[ln] : lines[ln].toLowerCase();
          var needle = opts.case ? opts.query : opts.query.toLowerCase();
          ok = hay.indexOf(needle) >= 0;
        }
        if (!ok) continue;
        hits.push({ node: node, line: ln, text: lines[ln].trim().slice(0, 240) });
        if (hits.length >= FIND_HIT_CAP) { capped = true; return; }
      }
    }
    for (var r = 0; r < state.roots.length; r++) {
      await walk(state.roots[r]);
      if (capped || job !== state.findJob) break;
    }
    if (job !== state.findJob) return;
    var notes = [];
    if (stopNote) notes.push(stopNote);
    else if (capped) notes.push("匹配较多，只列出前 " + FIND_HIT_CAP + " 条，后面的文件没有继续查找。这不是全部结果。");
    if (state.roots.length > 1) notes.push("这次在已打开的 " + state.roots.length + " 个目录里查找。");
    if (skippedDirs) notes.push("已跳过 " + skippedDirs + " 个依赖目录或隐藏目录（例如 node_modules、.git），这些目录里的文件没有参与查找。");
    if (skippedBig) notes.push("另有 " + skippedBig + " 个文件超过 800KB 或像二进制，没有检索它们的内容。");
    var noteHtml = notes.length ? '<div class="result-warn">' + notes.map(ND.esc).join("<br>") + "</div>" : "";
    showPanel("在文件中查找：" + opts.query + "（列出 " + hits.length + "）", noteHtml + (hits.map(function (h, idx) {
      return '<div class="hit" data-hit="' + idx + '"><b>' + ND.esc(h.node.name) + ":" + (h.line + 1) + "</b><span>" + ND.esc(h.text) + "</span></div>";
    }).join("") || "没有匹配"));
    state.hits = hits;
  }

  function collectFiles(node, out) {
    if (!node) return;
    if (node.kind === "file") out.push(node);
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) collectFiles(kids[i], out);
  }

  async function readNode(node) {
    try {
      var file = node.file || (node.handle && node.handle.getFile ? await node.handle.getFile() : null);
      if (!file || file.size > 800000) return null;
      var bytes = new Uint8Array(await file.arrayBuffer());
      if (looksBinary(bytes)) return null;
      return ND.codec.decodeBytes(bytes).text;
    } catch (e) { return null; }
  }

  function showPanel(title, html) {
    $("#panelTitle").textContent = title;
    $("#panelBody").innerHTML = html;
    $("#panel").classList.remove("hidden");
    $("#panelResizer").classList.remove("hidden");
  }

  async function openHit(hit) {
    var existing = null;
    var path = hit.node.file ? hit.node.file.webkitRelativePath : nodePath(hit.node);
    for (var i = 0; i < state.docs.length; i++) if (state.docs[i].path === path) existing = state.docs[i];
    if (!existing) {
      if (hit.node.handle) await openHandle(hit.node.handle, hit.node.parent, path);
      else if (hit.node.file) await openFileObject(hit.node.file, { path: path, parent: hit.node.parent });
    } else activate(existing);
    if (active()) {
      active().model.goto(hit.line + 1, 1);
      editor.reveal();
    }
  }

  function showCompare(leftLines, rightLines, leftName, rightName) {
    var cutNote = "";
    var leftAll = leftLines.length;
    var rightAll = rightLines.length;
    if (leftAll > COMPARE_LINE_CAP || rightAll > COMPARE_LINE_CAP) {
      leftLines = leftLines.slice(0, COMPARE_LINE_CAP);
      rightLines = rightLines.slice(0, COMPARE_LINE_CAP);
      cutNote = "对比提醒：左侧 " + leftAll + " 行，右侧 " + rightAll + " 行。这次只比较了前 " + COMPARE_LINE_CAP + " 行，后面的行没有进入结果，这不是全文差异。";
    }
    var result = ND.Diff.compare(leftLines, rightLines);
    state.compare = result;
    state.compIndex = 0;
    state.hunks = [];
    var open = false;
    result.rows.forEach(function (row, idx) {
      if (row.cls === "eq") open = false;
      else if (!open) { state.hunks.push(idx); open = true; }
    });
    var rowH = 20;
    $("#compare").innerHTML =
      '<div class="compare-bar"><strong>对比</strong><span>' + ND.esc(leftName) + " ↔ " + ND.esc(rightName) + "</span><span>差异块 " + result.hunks + '</span><span class="sp"></span>' +
      '<button type="button" class="btn" id="cmpPrev">上一处</button><button type="button" class="btn" id="cmpNext">下一处</button><button type="button" class="btn" id="cmpClose">返回编辑</button></div>' +
      (cutNote ? '<div class="result-warn">' + ND.esc(cutNote) + "</div>" : "") +
      '<div class="compare-cols"><div class="compare-pane" id="cmpL"><div class="cmp-spacer" style="height:' + (result.rows.length * rowH) + 'px"><div class="cmp-win" id="cmpWinL"></div></div></div>' +
      '<div class="compare-pane" id="cmpR"><div class="cmp-spacer" style="height:' + (result.rows.length * rowH) + 'px"><div class="cmp-win" id="cmpWinR"></div></div></div></div>';
    $("#compare").classList.remove("hidden");
    $("#hint").classList.add("hidden");
    function paintRows() {
      var pane = $("#cmpL");
      if (!pane) return;
      var st = pane.scrollTop;
      var start = Math.max(0, Math.floor(st / rowH) - 6);
      var count = Math.ceil((pane.clientHeight || 400) / rowH) + 14;
      var end = Math.min(result.rows.length, start + count);
      var left = "";
      var right = "";
      for (var i = start; i < end; i++) {
        var row = result.rows[i];
        var intra = row.cls === "chg" ? ND.Diff.intra(row.lt, row.rt) : null;
        var lt = intra && intra.l ? paintIntra(row.lt, intra.l) : ND.esc(row.lt);
        var rt = intra && intra.r ? paintIntra(row.rt, intra.r) : ND.esc(row.rt);
        if (intra && intra.full) { lt = ND.esc(row.lt); rt = ND.esc(row.rt); }
        var top = i * rowH;
        left += '<div class="drow ' + row.cls + '" data-row="' + i + '" style="top:' + top + 'px"><span class="ln">' + row.ln + '</span><span class="tx">' + lt + "</span></div>";
        right += '<div class="drow ' + row.cls + '" data-row="' + i + '" style="top:' + top + 'px"><span class="ln">' + row.rn + '</span><span class="tx">' + rt + "</span></div>";
      }
      $("#cmpWinL").innerHTML = left;
      $("#cmpWinR").innerHTML = right;
    }
    var lock = false;
    $("#cmpL").onscroll = function () {
      if (lock) return;
      lock = true;
      $("#cmpR").scrollTop = $("#cmpL").scrollTop;
      lock = false;
      paintRows();
    };
    $("#cmpR").onscroll = function () {
      if (lock) return;
      lock = true;
      $("#cmpL").scrollTop = $("#cmpR").scrollTop;
      lock = false;
      paintRows();
    };
    $("#cmpClose").onclick = closeCompare;
    $("#cmpNext").onclick = function () { jumpHunk(1); };
    $("#cmpPrev").onclick = function () { jumpHunk(-1); };
    paintRows();
  }

  function paintIntra(text, spans) {
    if (!spans || !spans.length) return ND.esc(text);
    var html = "";
    var i = 0;
    for (var k = 0; k < spans.length; k++) {
      html += ND.esc(text.slice(i, spans[k][0]));
      html += "<em>" + ND.esc(text.slice(spans[k][0], spans[k][1])) + "</em>";
      i = spans[k][1];
    }
    return html + ND.esc(text.slice(i));
  }

  function jumpHunk(dir) {
    var list = state.hunks || [];
    if (!list.length) return;
    state.compIndex = (state.compIndex + dir + list.length) % list.length;
    var pane = $("#cmpL");
    if (!pane) return;
    pane.scrollTop = Math.max(0, list[state.compIndex] * 20 - 60);
  }

  function closeCompare() {
    $("#compare").classList.add("hidden");
    $("#compare").innerHTML = "";
    updateHint();
    refreshMd();
  }

  var mdCache = { id: -1, text: null, mode: "" };
  var mdBlobs = [];
  var mdJob = 0;

  function revokeMdBlobs() {
    mdBlobs.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
    mdBlobs = [];
  }

  function joinPath(parts) {
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i] || parts[i] === ".") continue;
      if (parts[i] === "..") out.pop();
      else out.push(parts[i]);
    }
    return out.join("/");
  }

  function resolveRelPath(base, rel) {
    var dir = String(base || "").replace(/\\/g, "/").split("/");
    dir.pop();
    return joinPath(dir.concat(String(rel || "").replace(/\\/g, "/").split("/")));
  }

  function findNodeByPath(path) {
    var want = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    var found = null;
    function walk(n, prefix) {
      if (!n || found) return;
      var here = prefix ? prefix + "/" + n.name : n.name;
      if (n.kind === "file" && here === want) { found = n; return; }
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i], n.kind === "dir" ? here : prefix);
    }
    for (var r = 0; r < state.roots.length && !found; r++) walk(state.roots[r], "");
    return found;
  }

  async function fileForRel(doc, rel) {
    var full = resolveRelPath(doc.path || doc.name, rel);
    var node = findNodeByPath(full);
    if (node) {
      if (node.file) return node.file;
      if (node.handle && node.handle.getFile) return node.handle.getFile();
    }
    var dir = doc.parent && doc.parent.handle;
    if (!dir || !dir.getFileHandle) return null;
    var names = [];
    String(rel || "").replace(/\\/g, "/").split("/").forEach(function (name) {
      if (!name || name === ".") return;
      names.push(name);
    });
    if (names.indexOf("..") >= 0) return null;
    var cur = dir;
    for (var i = 0; i < names.length; i++) {
      if (i === names.length - 1) return (await cur.getFileHandle(names[i])).getFile();
      cur = await cur.getDirectoryHandle(names[i]);
    }
    return null;
  }

  function hydrateMdImages(body, doc) {
    var job = ++mdJob;
    revokeMdBlobs();
    Array.prototype.forEach.call(body.querySelectorAll("img[data-rel]"), function (img) {
      var rel = img.getAttribute("data-rel");
      fileForRel(doc, rel).then(function (file) {
        if (job !== mdJob || !file) return;
        var url = URL.createObjectURL(file);
        mdBlobs.push(url);
        img.src = url;
      }).catch(function () {
        if (job === mdJob) img.title = "找不到图片 " + rel;
      });
    });
  }

  async function openMdRel(rel) {
    var doc = active();
    if (!doc) return;
    var ext = String(rel || "").split("?")[0].split("#")[0].split(".").pop().toLowerCase();
    if (/^(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/.test(ext)) return;
    var file = null;
    try { file = await fileForRel(doc, rel); } catch (e) { file = null; }
    if (!file) { toast("找不到 " + rel); return; }
    var full = resolveRelPath(doc.path || doc.name, rel);
    var node = findNodeByPath(full);
    if (node && node.handle) await openHandle(node.handle, node.parent, full);
    else await openFileObject(file, { parent: doc.parent, path: full });
  }

  function onMdClick(e) {
    var viewBtn = e.target.closest("[data-mdview]");
    if (viewBtn) {
      settings.mdView = viewBtn.getAttribute("data-mdview");
      applySettings();
      return;
    }
    if (e.target.closest("[data-mdact='force']")) {
      var doc = active();
      if (doc) doc._mdForce = true;
      mdCache.text = null;
      refreshMd();
      return;
    }
    var a = e.target.closest("a");
    if (!a || !a.closest("#mdBody")) return;
    var rel = a.getAttribute("data-rel");
    if (rel) { e.preventDefault(); openMdRel(rel); return; }
    var href = a.getAttribute("href") || "";
    if (href.charAt(0) === "#") {
      e.preventDefault();
      var id = href.slice(1);
      try { id = decodeURIComponent(id); } catch (err) { /* keep */ }
      var nodes = $("#mdBody").querySelectorAll("[id]");
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) { nodes[i].scrollIntoView({ block: "start" }); break; }
      }
    }
  }

  function refreshMd() {
    var d = active();
    var mode = settings.mdView || "off";
    var comparing = !$("#compare").classList.contains("hidden");
    var show = !!(d && d.language === "markdown" && !d.hex && !editor.hexOn && mode !== "off" && !comparing);
    var stack = $("#stack");
    stack.classList.toggle("md-split", show && mode === "split");
    stack.classList.toggle("md-preview", show && mode === "preview");
    var pane = $("#mdPreview");
    if (pane) pane.classList.toggle("hidden", !show);
    document.querySelectorAll('.tb[data-act="md:toggle"]').forEach(function (el) { el.classList.toggle("on", show); });
    document.querySelectorAll("#mdPreview [data-mdview]").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-mdview") === mode);
    });
    if (!show || !d) return;
    var text = d.model.text();
    if (mdCache.id === d.id && mdCache.text === text && mdCache.mode === mode) return;
    mdCache.id = d.id;
    mdCache.text = text;
    mdCache.mode = mode;
    var body = $("#mdBody");
    if (!body) return;
    var top = body.scrollTop;
    if (text.length > 400000 && !d._mdForce) {
      body.innerHTML = '<div class="md-doc"><p class="md-note">这篇 Markdown 超过 40 万字，实时排版已暂停，避免卡顿。下面还没有按格式显示正文。</p><p><button type="button" data-mdact="force">仍然渲染全文</button></p></div>';
      return;
    }
    body.innerHTML = '<div class="md-doc">' + ND.Markdown.toHtml(text) + "</div>";
    body.scrollTop = top;
    hydrateMdImages(body, d);
  }

  async function compareFiles() {
    var choices = state.docs.filter(function (d) { return !d.hex; });
    if (choices.length < 1) { toast("至少打开一个文本"); return; }
    var opts = choices.map(function (d, i) { return '<option value="' + i + '">' + ND.esc(d.name) + "</option>"; }).join("");
    var id = await dialog({
      title: "对比文件",
      body: '<div class="fields"><div class="field"><span>左侧</span><select id="cmpA">' + opts + '</select></div><div class="field"><span>右侧</span><select id="cmpB">' + opts + "</select></div></div>",
      buttons: [["cancel", "取消"], ["ok", "对比", true]],
      init: function () { if (choices.length > 1) $("#cmpB").selectedIndex = 1; }
    });
    if (id !== "ok") return;
    var a = choices[Number($("#cmpA").value)];
    var b = choices[Number($("#cmpB").value)];
    showCompare(a.model.lines, b.model.lines, a.name, b.name);
    closeDialogDone();
  }

  function closeDialogDone() { /* dialog already closed by button */ }

  function compareDisk() {
    var d = active();
    if (!d || d.baseText == null) {
      if (d && d.truncated) toast("这份文件只载入了开头，没有全文可以和打开时比较。");
      else toast("没有打开时的快照");
      return;
    }
    showCompare(d.baseText.split("\n"), d.model.lines, d.name + "（打开时）", d.name + "（当前）");
  }

  async function compareFolder() {
    toast("请再选择要比较的文件夹");
    $("#dirOpenB").click();
  }

  function filesToMap(fileList) {
    var map = new Map();
    Array.prototype.forEach.call(fileList, function (file) {
      var rel = file.webkitRelativePath.split("/").slice(1).join("/");
      map.set(rel, file);
    });
    return map;
  }

  async function runFolderCompare(files) {
    if (!state.roots.length) { toast("先打开左侧文件夹"); return; }
    var job = ++state.findJob;
    showPanel("正在对比文件夹…", '<div class="result-warn">正在读取左侧目录。关闭结果面板会停止。</div>');
    var left = [];
    for (var ri = 0; ri < state.roots.length; ri++) {
      await ensureTree(state.roots[ri], job);
      if (job !== state.findJob) return;
      collectFiles(state.roots[ri], left);
    }
    var leftMap = new Map();
    var keepHead = state.roots.length > 1;
    left.forEach(function (n) {
      var raw = n.file && n.file.webkitRelativePath ? n.file.webkitRelativePath : nodePath(n);
      var parts = String(raw).split("/");
      if (!keepHead) parts = parts.slice(1);
      var rel = parts.filter(Boolean).join("/");
      if (!pathHasSkip(rel, keepHead)) leftMap.set(rel, n);
    });
    var rightMap = filesToMap(files);
    var keys = [];
    leftMap.forEach(function (_, key) { keys.push(key); });
    rightMap.forEach(function (_, key) { if (!leftMap.has(key)) keys.push(key); });
    var sizeOnly = keys.length > 4000;
    var rows = [];
    var skipped = 0;
    var sized = 0;
    for (var i = 0; i < keys.length; i++) {
      if (i % 40 === 0) {
        $("#panelTitle").textContent = "正在对比… " + i + " / " + keys.length;
        await yieldUI();
        if (job !== state.findJob) return;
      }
      var key = keys[i];
      if (pathHasSkip(key, keepHead)) { skipped++; continue; }
      var L = leftMap.get(key);
      var R = rightMap.get(key);
      var kind = "same";
      if (L && !R) kind = "onlyL";
      else if (!L && R) kind = "onlyR";
      else {
        var lf = L.file || (L.handle ? await L.handle.getFile() : null);
        if (lf && R && lf.size !== R.size) kind = "diff";
        else if (lf && R && !sizeOnly && lf.size < 200000) {
          var a = new Uint8Array(await lf.arrayBuffer());
          var b = new Uint8Array(await R.arrayBuffer());
          if (a.length !== b.length || ND.codec.sha256(a) !== ND.codec.sha256(b)) kind = "diff";
        } else if (lf && R) { kind = "size"; sized++; }
      }
      rows.push({ key: key, kind: kind });
    }
    if (job !== state.findJob) return;
    rows.sort(function (a, b) { return a.key.localeCompare(b.key, "zh"); });
    var listCut = rows.length > FOLDER_ROW_CAP;
    var view = listCut ? rows.slice(0, FOLDER_ROW_CAP) : rows;
    var notes = [];
    notes.push(skipped ? "已跳过 " + skipped + " 条位于依赖目录或隐藏目录中的路径，它们没有参加对比。" : "依赖目录和隐藏目录没有参加对比。");
    if (keepHead) notes.push("左侧有 " + state.roots.length + " 个已打开的目录，对比路径包含各自的目录名。右侧是单独选择的一个目录，路径不含该目录名。");
    if (sizeOnly) notes.push("路径很多，只按文件大小判断异同，没有逐份读取内容。");
    if (sized) notes.push("有 " + sized + " 个文件只比较了大小（文件较大或数量很多）。「大小相同」不代表内容一致。");
    if (listCut) notes.push("结果共 " + rows.length + " 项，列表只显示前 " + FOLDER_ROW_CAP + " 项，其余没有画出来。");
    var label = { onlyL: "仅左侧", onlyR: "仅右侧", diff: "不同", same: "相同", size: "大小相同" };
    showPanel("文件夹对比", '<div class="result-warn">' + notes.map(ND.esc).join("<br>") + "</div>" + view.map(function (r) {
      return '<div class="hit"><b>' + label[r.kind] + "</b><span>" + ND.esc(r.key) + "</span></div>";
    }).join("") || "没有文件");
    toast("对比结束，列出 " + view.length + " 项" + (listCut ? "，结果已截断" : ""));
  }

  function formatJSON() {
    var d = active();
    if (!d || editor.hexOn) return;
    try {
      var obj = JSON.parse(d.model.text());
      d.model.setText(JSON.stringify(obj, null, 2));
      d.model.gen = 1;
      d.model.cleanGen = 0;
      d.language = "json";
      toast("已格式化 JSON");
    } catch (e) { toast("JSON 无法解析：" + e.message); }
  }

  function formatXML() {
    var d = active();
    if (!d || editor.hexOn) return;
    var src = d.model.text().replace(/>\s*</g, "><");
    var pad = 0;
    var out = src.replace(/<[^>]+>/g, function (tag) {
      var line = "";
      if (tag.match(/^<\//)) pad = Math.max(0, pad - 1);
      line = "  ".repeat(pad) + tag;
      if (tag.match(/^<[^!?/][^>]*[^/]>$/)) pad++;
      return "\n" + line;
    }).trim();
    d.model.setText(out);
    d.model.gen = 1;
    d.model.cleanGen = 0;
    toast("已整理 XML / HTML 缩进");
  }

  async function hashOf(kind) {
    var d = active();
    if (!d) return;
    var text = d.model.selectedText() || (editor.hexOn ? "" : d.model.text());
    var bytes = editor.hexOn && !d.model.selectedText() ? (editor.bytes || new Uint8Array(0)) : ND.codec.utf8Bytes(text);
    var hex = kind === "md5" ? ND.codec.md5(bytes) : ND.codec.sha256(bytes);
    await ask(kind.toUpperCase(), hex, [["ok", "关闭", true]]);
    copyText(hex);
  }

  async function toolBase64() {
    var d = active();
    if (!d) return;
    var text = d.model.selectedText() || d.model.text();
    var mode = await ask("Base64", "对当前选区或全文：", [["cancel", "取消"], ["dec", "解码"], ["enc", "编码", true]]);
    if (mode === "enc") {
      var b64 = btoa(unescape(encodeURIComponent(text)));
      d.model.insertText ? replaceWholeOrSel(d, b64) : 0;
    } else if (mode === "dec") {
      try { replaceWholeOrSel(d, decodeURIComponent(escape(atob(text.trim())))); }
      catch (e) { toast("不是合法的 Base64"); }
    }
  }

  async function toolUrl() {
    var d = active();
    if (!d) return;
    var text = d.model.selectedText() || d.model.text();
    var mode = await ask("URL", "对当前选区或全文：", [["cancel", "取消"], ["dec", "解码"], ["enc", "编码", true]]);
    if (mode === "enc") replaceWholeOrSel(d, encodeURIComponent(text));
    else if (mode === "dec") {
      try { replaceWholeOrSel(d, decodeURIComponent(text)); }
      catch (e) { toast("URL 解码失败"); }
    }
  }

  function replaceWholeOrSel(doc, text) {
    var m = doc.model;
    if (m.hasSelection()) m.insertText(text);
    else m.setText(text);
    editor.schedule();
  }

  function stats() {
    var d = active();
    if (!d) return;
    var s = d.model.stats();
    var bytes = d.originalBytes ? d.originalBytes.length : ND.codec.utf8Bytes(d.model.text()).length;
    ask("统计", "行数 " + s.lines + "\n字符 " + s.chars + "\n单词 " + s.words + "\n选区 " + s.sel + "\n大约字节 " + bytes, [["ok", "关闭", true]]);
  }

  function eolMenu(x, y) {
    popup(x, y, [["Windows (CRLF)", "eol:\r\n"], ["Unix (LF)", "eol:\n"], ["Mac (CR)", "eol:\r"]], function (act) {
      var d = active();
      if (!d) return;
      d.eol = act.slice(4);
      d.model.gen++;
      d.model.changed();
      paintStatus();
    });
  }

  function sampleText() {
    return [
      "/**",
      " * NotePadWeb-- 网页版示例",
      " * Ctrl+S 保存，Ctrl+F 查找，Ctrl+H 替换。",
      " * 左侧可以打开文件夹；直接双击 html 时，保存会下载副本。",
      " */",
      "function greet(name) {",
      "  const message = \"你好, \" + name;",
      "  if (!name) return 0;",
      "  console.log(message);",
      "  return message.length;",
      "}",
      "",
      "class Editor {",
      "  constructor(tabSize) {",
      "    this.tabSize = tabSize || 4;",
      "  }",
      "  indent(line) {",
      "    return \" \".repeat(this.tabSize) + line;",
      "  }",
      "}",
      "",
      "const values = [1, 2, 8];",
      "for (const n of values) {",
      "  greet(\"NotePadWeb-- \" + n);",
      "}",
      ""
    ].join("\n");
  }

  function applySettings() {
    document.body.dataset.theme = settings.theme;
    app.classList.toggle("no-side", !settings.sidebar);
    app.classList.toggle("no-toolbar", !settings.toolbar);
    app.classList.toggle("no-status", !settings.statusbar);
    editor.setFont(settings.fontSize, settings.fontFamily);
    editor.showWs = !!settings.showWs;
    editor.wrap = !!settings.wrap && !(active() && active().noWrap);
    editor.minimapOn = !!settings.minimap;
    editor.folding = !!settings.folding;
    editor.tabSize = settings.tabSize;
    editor.autoPair = settings.autoPair !== false;
    editor.autoWord = settings.autoWord !== false;
    if (!editor.autoWord) editor.clearSuggest();
    state.docs.forEach(function (d) {
      d.model.tabSize = settings.tabSize;
      d.model.insertSpaces = settings.insertSpaces;
      d.model.autoIndent = settings.autoIndent;
    });
    document.querySelectorAll("[data-flag]").forEach(function (el) {
      var on = !!settings[el.getAttribute("data-flag")];
      el.textContent = on ? "✓" : "";
    });
    document.querySelectorAll('.tb[data-act="wrap"]').forEach(function (el) { el.classList.toggle("on", settings.wrap); });
    document.querySelectorAll('.tb[data-act="ws"]').forEach(function (el) { el.classList.toggle("on", settings.showWs); });
    document.querySelectorAll('.menu-item[data-act^="md:"]').forEach(function (el) {
      var mode = el.getAttribute("data-act").slice(3);
      var box = el.querySelector(".check");
      if (!box) {
        box = document.createElement("span");
        box.className = "check";
        el.insertBefore(box, el.firstChild);
      }
      box.textContent = (settings.mdView || "off") === mode ? "✓" : "";
    });
    saveSettings();
    editor.schedule();
    refreshMd();
  }

  async function openSettings() {
    var fonts = ["Consolas", "Cascadia Mono", "Courier New", "Microsoft YaHei Mono", "Sarasa Mono SC", "monospace"];
    var id = await dialog({
      title: "首选项",
      body: '<div class="fields">' +
        '<div class="field"><span>字体</span><select id="setFont">' + fonts.map(function (f) {
          return '<option' + (settings.fontFamily.indexOf(f) === 0 ? " selected" : "") + ">" + f + "</option>";
        }).join("") + "</select></div>" +
        '<div class="field"><span>字号</span><input id="setSize" type="number" min="10" max="32" value="' + settings.fontSize + '"></div>' +
        '<div class="field"><span>Tab 宽度</span><input id="setTab" type="number" min="1" max="8" value="' + settings.tabSize + '"></div>' +
        '<label><input id="setSpace" type="checkbox"' + (settings.insertSpaces ? " checked" : "") + "> 用空格代替 Tab</label>" +
        '<label><input id="setIndent" type="checkbox"' + (settings.autoIndent ? " checked" : "") + "> 自动缩进</label>" +
        '<label><input id="setPair" type="checkbox"' + (settings.autoPair !== false ? " checked" : "") + "> 括号、引号自动补全</label>" +
        '<label><input id="setWord" type="checkbox"' + (settings.autoWord !== false ? " checked" : "") + "> 词语联想（Tab 补齐）</label>" +
        "</div>",
      buttons: [["cancel", "取消"], ["ok", "确定", true]]
    });
    if (id !== "ok") return;
    var font = $("#setFont").value;
    settings.fontFamily = font === "monospace" ? "monospace" : font + ', "Microsoft YaHei Mono", monospace';
    settings.fontSize = clampNum($("#setSize").value, 10, 32, 14);
    settings.tabSize = clampNum($("#setTab").value, 1, 8, 4);
    settings.insertSpaces = $("#setSpace").checked;
    settings.autoIndent = $("#setIndent").checked;
    settings.autoPair = $("#setPair").checked;
    settings.autoWord = $("#setWord").checked;
    applySettings();
  }

  function clampNum(v, a, b, d) {
    var n = Number(v);
    if (!n) return d;
    return Math.max(a, Math.min(b, n));
  }

  function run(act) {
    var d = active();
    var m = d && d.model;
    if (!act) return;
    if (act.indexOf("theme:") === 0) { settings.theme = act.slice(6); applySettings(); return; }
    if (act.indexOf("lang:") === 0) { if (d) { d.language = act.slice(5); editor.schedule(); paintStatus(); } return; }
    if (act.indexOf("enc:") === 0) { if (d) { d.encoding = act.slice(4); d.model.gen++; paintStatus(); paintDirty(); } return; }
    if (act.indexOf("reopen:") === 0) { reinterpret(act.slice(7)); return; }
    if (act.indexOf("md:") === 0) {
      var mode = act.slice(3);
      if (mode === "toggle") settings.mdView = settings.mdView && settings.mdView !== "off" ? "off" : "split";
      else settings.mdView = mode;
      applySettings();
      if (d && d.language !== "markdown" && settings.mdView !== "off") toast("打开 Markdown 文件后会在旁边排版显示");
      return;
    }
    var comment = d ? ND.Highlight.lineComment(d.language) : null;
    var block = d ? ND.Highlight.blockComment(d.language) : null;
    var actions = {
      "new": function () { addDoc(createDoc("未命名-" + (state.docs.length + 1))); },
      openFile: function () {
        if (window.showOpenFilePicker && window.isSecureContext) {
          window.showOpenFilePicker({ multiple: true }).then(function (handles) {
            handles.forEach(function (h) { openHandle(h, null, h.name); });
          }).catch(function () {});
        } else $("#fileOpen").click();
      },
      openFolder: openFolder,
      closeFolders: closeFolders,
      sample: function () {
        var doc = createDoc("example.js");
        doc.language = "javascript";
        doc.model.setText(sampleText());
        doc.model.markClean();
        doc.baseText = doc.model.text();
        addDoc(doc);
      },
      save: function () { saveDoc(d, false); },
      saveAs: function () { saveDoc(d, true); },
      saveAll: function () { state.docs.forEach(function (doc) { if (doc.model.dirty() || doc.hexDirty) saveDoc(doc, false); }); },
      close: function () { closeDoc(d); },
      closeAll: async function () {
        var list = state.docs.slice();
        for (var i = 0; i < list.length; i++) await closeDoc(list[i]);
      },
      print: function () {
        if (!m) return;
        var w = window.open("", "_blank");
        if (!w) { toast("浏览器拦截了打印窗口"); return; }
        w.document.write("<pre style=\"font-family:Consolas,monospace\">" + ND.esc(m.text()) + "</pre>");
        w.document.close();
        w.focus();
        w.print();
      },
      undo: function () { if (m) m.undo(); },
      redo: function () { if (m) m.redo(); },
      cut: function () {
        if (!m) return;
        var text = m.selectedText() || (m.lines[m.cursor.line] + "\n");
        copyText(text);
        if (m.hasSelection()) m.insertText("");
        else m.deleteLine();
      },
      copy: function () { if (m) copyText(editor.copySelection()); },
      paste: function () { toast("请直接按 Ctrl+V"); },
      selectAll: function () { if (m) m.selectAll(); },
      dupLine: function () { if (m) m.duplicateLine(); },
      delLine: function () { if (m) m.deleteLine(); },
      moveUp: function () { if (m) m.moveLine(-1); },
      moveDown: function () { if (m) m.moveLine(1); },
      comment: function () { if (m && comment) m.toggleLineComment(comment); else toast("当前语言没有行注释"); },
      blockComment: function () { if (m && block) m.toggleBlockComment(block[0], block[1]); },
      upper: function () { if (m) m.transformCase("upper"); },
      lower: function () { if (m) m.transformCase("lower"); },
      title: function () { if (m) m.transformCase("title"); },
      trim: function () { if (m) m.trimTrailing(); },
      emptyLines: function () { if (m) m.deleteEmptyLines(); },
      sortAsc: function () { if (m) m.sortLines("asc"); },
      sortDesc: function () { if (m) m.sortLines("desc"); },
      reverse: function () { if (m) m.sortLines("reverse"); },
      unique: function () { if (m) m.sortLines("unique"); },
      find: function () { openFind(false); },
      replace: function () { openFind(true); },
      findFiles: function () { openFind(false); setTimeout(findInFiles, 0); },
      findNext: function () { doFind(1); },
      findPrev: function () { doFind(-1); },
      goto: async function () {
        if (!m) return;
        var val = await promptText("跳转到行", String(m.cursor.line + 1));
        var n = Number(val);
        if (n) { m.goto(n, 1); editor.reveal(); }
      },
      markAll: function () { state.find.mark = true; applyMarks(); },
      bookmark: function () { if (m) m.toggleBookmark(m.cursor.line); },
      nextBm: function () { if (m && !m.nextBookmark(1)) toast("没有书签"); editor.reveal(); },
      prevBm: function () { if (m && !m.nextBookmark(-1)) toast("没有书签"); editor.reveal(); },
      clearBm: function () { if (m) m.clearBookmarks(); },
      bracket: function () {
        if (!m) return;
        var pair = m.matchBrackets();
        if (pair.length === 2) { m.collapseTo(pair[1].col === m.cursor.col && pair[1].line === m.cursor.line ? pair[0] : pair[1]); editor.reveal(); }
      },
      wrap: function () { settings.wrap = !settings.wrap; applySettings(); },
      ws: function () { settings.showWs = !settings.showWs; applySettings(); },
      minimap: function () { settings.minimap = !settings.minimap; applySettings(); },
      folding: function () { settings.folding = !settings.folding; applySettings(); },
      sidebar: function () { settings.sidebar = !settings.sidebar; applySettings(); },
      toolbar: function () { settings.toolbar = !settings.toolbar; applySettings(); },
      statusbar: function () { settings.statusbar = !settings.statusbar; applySettings(); },
      autoPair: function () { settings.autoPair = !settings.autoPair; applySettings(); },
      autoWord: function () { settings.autoWord = !settings.autoWord; applySettings(); },
      zoomIn: function () { settings.fontSize = Math.min(32, settings.fontSize + 1); applySettings(); },
      zoomOut: function () { settings.fontSize = Math.max(10, settings.fontSize - 1); applySettings(); },
      zoomReset: function () { settings.fontSize = 14; applySettings(); },
      fullscreen: function () {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      },
      hex: function () { toggleHex(); },
      readonly: function () { if (d) { d.readOnly = !d.readOnly; d.model.readOnly = d.readOnly; toast(d.readOnly ? "只读" : "可编辑"); paintStatus(); } },
      settings: openSettings,
      macroRec: function () { ND.macro.rec = true; ND.macro.ops = []; toast("开始录制"); paintStatus(); },
      macroStop: function () { ND.macro.rec = false; toast("停止，共 " + ND.macro.ops.length + " 步"); paintStatus(); },
      macroPlay: function () {
        if (!m || !ND.macro.ops.length) { toast("没有宏"); return; }
        ND.macro.play = true;
        ND.macro.ops.forEach(function (op) { m[op.name].apply(m, op.args); });
        ND.macro.play = false;
        editor.reveal();
      },
      macroClear: function () { ND.macro.ops = []; ND.macro.rec = false; toast("已清空宏"); },
      md5: function () { hashOf("md5"); },
      sha: function () { hashOf("sha"); },
      base64: toolBase64,
      url: toolUrl,
      jsonfmt: formatJSON,
      xmlfmt: formatXML,
      stats: stats,
      compare: compareFiles,
      compareDisk: compareDisk,
      compareFolder: compareFolder,
      nextTab: function () { cycle(1); },
      prevTab: function () { cycle(-1); },
      showDocs: function () { state.side = "docs"; setSideTab(); renderSide(); },
      showFuncs: function () { state.side = "funcs"; setSideTab(); renderSide(); },
      overtype: function () { if (m) { m.overtype = !m.overtype; paintStatus(); } },
      eolMenu: function () {},
      encMenu: function () {},
      langMenu: function () {},
      shortcuts: function () {
        ask("快捷键", "Ctrl+N/O/S 新建、打开、保存\nCtrl+F/H 查找、替换，F3 下一个\nCtrl+G 跳转，Ctrl+D 复制行\nCtrl+/ 注释，Ctrl+F2 书签，F2 下一书签\nCtrl+Shift+M Markdown 预览\nAlt+Up/Down 移动行\n拖动文件夹到窗口即可打开", [["ok", "关闭", true]]);
      },
      about: function () {
        ask("关于 NotePadWeb--", "作者：汪继鹏 w00524734\n版本：v1.0\n\n这是一个纯前端的 NotePadWeb--。用浏览器打开即可编辑文本、浏览目录、语法高亮、查找替换、对比文件。Markdown 会在旁边按标题、列表、表格和代码块排版显示。\n直接双击打开时，保存会下载文件；通过 localhost 打开时，可以用系统文件框写回原文件。", [["ok", "关闭", true]]);
      }
    };
    if (actions[act]) actions[act]();
  }

  function cycle(dir) {
    if (state.docs.length < 2) return;
    var i = state.docs.indexOf(state.active);
    activate(state.docs[(i + dir + state.docs.length) % state.docs.length]);
  }

  function toggleHex() {
    var d = active();
    if (!d) return;
    if (!editor.hexOn) {
      var packed = ND.codec.encodeText(ND.codec.joinEol(d.model.lines, d.eol), d.encoding === "gbk" || d.encoding === "gb18030" || d.encoding === "utf-16le" ? d.encoding : "utf-8");
      if (packed.missing.length) { toast("有字符无法编码成 " + d.encoding); return; }
      d.bytes = packed.bytes;
      d.hex = true;
      editor.bytes = packed.bytes;
      editor.hexOn = true;
      editor.hexPos = 0;
      editor.hexDirty = false;
    } else {
      var dec = ND.codec.decodeBytes(editor.bytes || new Uint8Array(0));
      var split = ND.codec.splitText(dec.text);
      d.encoding = dec.encoding || d.encoding;
      d.eol = split.eol;
      d.model.setText(split.lines.join("\n"));
      if (editor.hexDirty) { d.model.gen = 1; d.model.cleanGen = 0; }
      else d.model.markClean();
      d.hex = false;
      editor.hexOn = false;
      editor.hexDirty = false;
    }
    editor.schedule();
    paintStatus();
    paintDirty();
  }

  function reinterpret(encoding) {
    var d = active();
    if (!d || !d.originalBytes) { toast("没有原始字节可以重新解码"); return; }
    if (d.model.dirty()) { toast("请先保存或放弃当前修改后再重新打开"); return; }
    var bytes = d.originalBytes;
    var text = "";
    if (encoding === "gbk" || encoding === "gb18030") text = new TextDecoder("gb18030").decode(stripBom(bytes, encoding));
    else if (encoding === "utf-16le") text = new TextDecoder("utf-16le").decode(stripBom(bytes, encoding));
    else text = new TextDecoder("utf-8").decode(stripBom(bytes, encoding));
    var split = ND.codec.splitText(text);
    d.model.setText(split.lines.join("\n"));
    d.model.markClean();
    d.encoding = encoding;
    d.eol = split.eol;
    d.baseText = d.truncated ? null : d.model.text();
    toast(d.truncated ? "已按 " + encoding + " 重新解码已载入的开头，不是整个文件。" : "已按 " + encoding + " 重新解码");
    paintStatus();
  }

  function stripBom(bytes, encoding) {
    if (encoding === "utf-8" && bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return bytes.subarray(3);
    if (encoding === "utf-16le" && bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2);
    return bytes;
  }

  function setSideTab() {
    document.querySelectorAll(".side-tabs button").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-tab") === state.side);
    });
  }

  function collectShortcuts() {
    var list = [];
    function walk(items) {
      if (!items || typeof items.forEach !== "function") return;
      items.forEach(function (it) {
        if (it && typeof it === "object" && it.sub) walk(it.sub);
        else if (it && it !== "sep" && it[1]) list.push(it);
      });
    }
    MENUS.forEach(function (m) { walk(m.items); });
    return list;
  }

  function onKey(e) {
    if (e.isComposing) return;
    var dlg = !$("#modal").classList.contains("hidden");
    if (e.key === "Escape") {
      if (dlg) { closeDialog("cancel"); e.preventDefault(); return; }
      if (!$("#popup").classList.contains("hidden")) { $("#popup").classList.add("hidden"); return; }
      if (!$("#findDlg").classList.contains("hidden")) { $("#findDlg").classList.add("hidden"); editor.focus(); return; }
      if (!$("#compare").classList.contains("hidden")) { closeCompare(); return; }
    }
    if (dlg) return;
    var field = isField(e.target);
    var globalKey = (e.ctrlKey || e.metaKey) && ["s", "f", "h", "g", "p", "n", "o", "w"].indexOf(e.key.toLowerCase()) >= 0;
    if (field && !globalKey && e.key !== "F3" && e.key !== "F2") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return;
    var shortcuts = collectShortcuts();
    for (var i = 0; i < shortcuts.length; i++) {
      if (accelMatch(e, shortcuts[i][1])) {
        e.preventDefault();
        e.stopPropagation();
        run(shortcuts[i][2]);
        return;
      }
    }
    if (e.key === "F11") { e.preventDefault(); run("fullscreen"); }
  }

  function bindUI() {
    $("#menubar").addEventListener("mousedown", function (e) { e.preventDefault(); });
    $("#menubar").addEventListener("mouseover", function (e) {
      var sub = e.target.closest(".menu-item.has-sub");
      if (!sub || (e.relatedTarget && sub.contains(e.relatedTarget))) return;
      var pop = sub.querySelector(":scope > .menu-pop");
      if (!pop) return;
      sub.classList.remove("flip");
      var room = window.innerWidth - sub.getBoundingClientRect().right;
      var width = pop.scrollWidth || 230;
      if (room < width + 8) sub.classList.add("flip");
    });
    $("#toolbar").addEventListener("mousedown", function (e) { if (e.target.closest("button")) e.preventDefault(); });
    $("#menubar").addEventListener("click", function (e) {
      var title = e.target.closest(".menu-title");
      var item = e.target.closest(".menu-item[data-act]");
      if (title) {
        var menu = title.parentElement;
        var open = menu.classList.contains("open");
        document.querySelectorAll(".menu.open").forEach(function (m) { m.classList.remove("open"); });
        if (!open) menu.classList.add("open");
        return;
      }
      if (item) {
        document.querySelectorAll(".menu.open").forEach(function (m) { m.classList.remove("open"); });
        run(item.getAttribute("data-act"));
      }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".menu")) document.querySelectorAll(".menu.open").forEach(function (m) { m.classList.remove("open"); });
      if (!e.target.closest("#popup")) $("#popup").classList.add("hidden");
    });
    $("#toolbar").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (btn) run(btn.getAttribute("data-act"));
    });
    $("#hint").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (btn) run(btn.getAttribute("data-act"));
    });
    $("#tabs").addEventListener("click", function (e) {
      var x = e.target.closest("[data-x]");
      if (x) { closeDoc(docById(x.getAttribute("data-x"))); return; }
      var tab = e.target.closest(".tab");
      if (tab) activate(docById(tab.getAttribute("data-id")));
    });
    $("#tabs").addEventListener("auxclick", function (e) {
      var tab = e.target.closest(".tab");
      if (tab && e.button === 1) closeDoc(docById(tab.getAttribute("data-id")));
    });
    document.querySelectorAll(".side-tabs button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.side = btn.getAttribute("data-tab");
        setSideTab();
        renderSide();
      });
    });
    $("#treeFilter").addEventListener("input", renderSide);
    $("#sideBody").addEventListener("click", function (e) {
      var rm = e.target.closest("[data-remove-root]");
      if (rm) {
        var gone = state.nodeMap.get(Number(rm.getAttribute("data-remove-root")));
        if (gone) removeRoot(gone);
        return;
      }
      var fn = e.target.closest(".fn-item");
      if (fn && active()) { active().model.goto(Number(fn.getAttribute("data-line")) + 1, 1); editor.reveal(); return; }
      var doc = e.target.closest(".doc-item");
      if (doc) { activate(docById(doc.getAttribute("data-doc"))); return; }
      var node = e.target.closest(".node");
      if (node) onTreeClick(node.getAttribute("data-nid"));
    });
    $("#sideBody").addEventListener("contextmenu", function (e) {
      var nodeEl = e.target.closest(".node");
      if (!nodeEl) return;
      e.preventDefault();
      var node = state.nodeMap.get(Number(nodeEl.getAttribute("data-nid")));
      if (node) treeMenu(e.clientX, e.clientY, node);
    });
    $("#status").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "eolMenu") return eolMenu(e.clientX, e.clientY - 80);
      if (act === "encMenu") return popup(e.clientX - 120, e.clientY - 160, [["UTF-8", "enc:utf-8"], ["UTF-8 BOM", "enc:utf-8-bom"], ["GBK", "enc:gbk"], ["UTF-16 LE", "enc:utf-16le"]], run);
      if (act === "langMenu") {
        var items = ND.Highlight.listLanguages().map(function (l) { return [l.name, "lang:" + l.id]; });
        return popup(Math.max(8, e.clientX - 160), Math.max(8, e.clientY - 280), items, run);
      }
      run(act);
    });
    $("#fileOpen").addEventListener("change", function (e) {
      Array.prototype.forEach.call(e.target.files || [], function (file) { openFileObject(file, { path: file.name }); });
      e.target.value = "";
    });
    $("#dirOpen").addEventListener("change", function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = "";
      if (files.length) workspaceFromFiles(files);
    });
    $("#dirOpenB").addEventListener("change", function (e) {
      var files = e.target.files;
      e.target.value = "";
      if (files && files.length) runFolderCompare(files);
    });
    $("#panelClose").addEventListener("click", function () {
      state.findJob++;
      $("#panel").classList.add("hidden");
      $("#panelResizer").classList.add("hidden");
    });
    var mdPane = $("#mdPreview");
    if (mdPane) mdPane.addEventListener("click", onMdClick);
    $("#panelBody").addEventListener("click", function (e) {
      var hit = e.target.closest("[data-hit]");
      if (hit && state.hits) openHit(state.hits[Number(hit.getAttribute("data-hit"))]);
    });
    $("#modal").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-dlg]");
      if (btn) closeDialog(btn.getAttribute("data-dlg"));
    });
    $("#findDlg").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-fact]");
      if (!btn) return;
      var fact = btn.getAttribute("data-fact");
      if (fact === "close") { $("#findDlg").classList.add("hidden"); editor.focus(); return; }
      if (fact === "next") doFind(1);
      if (fact === "prev") doFind(-1);
      if (fact === "one" && active()) { active().model.replaceOne(findOpts()); editor.reveal(); applyMarks(); }
      if (fact === "all" && active()) {
        var res = active().model.replaceAll(findOpts());
        if (res.error) toast(res.error);
        else if (res.capped) toast("替换了 " + res.count + " 处。匹配很多，已到上限，更后面的内容没有替换。");
        else toast("替换了 " + res.count + " 处");
        applyMarks();
      }
      if (fact === "count" && active()) {
        var all = active().model.findAll(findOpts(), 50000);
        toast(all.error ? all.error : ("共 " + all.count + " 处" + (all.capped ? "（已截断）" : "")));
      }
      if (fact === "files") findInFiles();
    });
    $("#findDlg").addEventListener("input", function () { readFind(); applyMarks(); });
    $("#findDlg").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); doFind(e.shiftKey ? -1 : 1); }
      if (e.key === "Escape") { $("#findDlg").classList.add("hidden"); editor.focus(); }
    });
    dragDialog($("#findDlg"));
    window.addEventListener("keydown", onKey, true);
    editor.ime.addEventListener("paste", function (e) {
      if (editor.hexOn || !active()) return;
      var text = e.clipboardData && e.clipboardData.getData("text/plain");
      if (text == null) return;
      e.preventDefault();
      editor._revealNext = true;
      active().model.insertText(text);
    });
    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("drop", function (e) {
      e.preventDefault();
      var items = e.dataTransfer && e.dataTransfer.items;
      if (!items || !items.length) return;
      var saw = false;
      for (var i = 0; i < items.length; i++) {
        var entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
        if (entry && entry.isDirectory) { importDirectory(entry); saw = true; }
        else if (entry && entry.isFile) {
          saw = true;
          entry.file(function (file) { openFileObject(file, { path: file.name }); });
        }
      }
      if (!saw) Array.prototype.forEach.call(e.dataTransfer.files || [], function (file) { openFileObject(file, { path: file.name }); });
    });
    window.addEventListener("beforeunload", function (e) {
      if (state.docs.some(function (d) { return d.model.dirty() || d.hexDirty; })) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    resizeDrag($("#sideResizer"), true);
    resizeDrag($("#panelResizer"), false);
    $("#banner").addEventListener("click", function () { $("#banner").classList.add("hidden"); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { editor.measure(); editor.schedule(); });
  }

  function dragDialog(el) {
    var head = null;
    var ox = 0;
    var oy = 0;
    el.addEventListener("mousedown", function (e) {
      head = e.target.closest("header");
      if (!head) return;
      var r = el.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      function move(ev) {
        el.style.left = (ev.clientX - ox) + "px";
        el.style.top = (ev.clientY - oy) + "px";
        el.style.right = "auto";
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  function resizeDrag(handle, horizontal) {
    handle.addEventListener("mousedown", function (e) {
      e.preventDefault();
      function move(ev) {
        if (horizontal) $("#side").style.width = Math.max(140, Math.min(520, ev.clientX)) + "px";
        else $("#panel").style.height = Math.max(80, Math.min(420, window.innerHeight - ev.clientY)) + "px";
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        editor.schedule();
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  function importDirectory(entry) {
    var root = { nid: state.nid++, name: entry.name, kind: "dir", children: [], expanded: true };
    readEntry(entry, root).then(function () {
      (function sortRec(n) { if (!n.children) return; sortNodes(n.children); n.children.forEach(sortRec); })(root);
      addRoot(root);
    });
  }

  function readEntry(entry, node) {
    return new Promise(function (resolve) {
      if (entry.isFile) {
        entry.file(function (file) {
          node.kind = "file";
          node.file = file;
          node.children = undefined;
          resolve();
        });
        return;
      }
      var reader = entry.createReader();
      var all = [];
      var read = function () {
        reader.readEntries(function (ents) {
          if (!ents.length) {
            Promise.all(all.map(function (ent) {
              var child = { nid: state.nid++, name: ent.name, kind: ent.isDirectory ? "dir" : "file", children: ent.isDirectory ? [] : undefined, parent: node, expanded: false };
              node.children.push(child);
              return readEntry(ent, child);
            })).then(resolve);
            return;
          }
          all = all.concat(Array.prototype.slice.call(ents));
          read();
        });
      };
      read();
    });
  }

  function boot() {
    buildMenus();
    buildToolbar();
    bindUI();
    applySettings();
    if (!window.isSecureContext) {
      var banner = $("#banner");
      banner.textContent = "现在是直接打开的本地页面，可以浏览和编辑。按 Ctrl+S 会把文件下载下来。若要覆盖原始文件，请用 Chrome 或 Edge 通过 http://localhost 打开这一页，再点「打开文件夹」。点击本条可关闭。";
      banner.classList.remove("hidden");
    }
    addDoc(createDoc("未命名-1"));
    window.__ndd = { state: state, editor: editor, settings: settings, run: run, ND: ND };
    window.addEventListener("error", function (e) { toast(e.message || "脚本错误"); });
  }

  boot();
})();
