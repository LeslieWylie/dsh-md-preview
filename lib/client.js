window.__ModuleLoader__.load({ id: "dsh-md-html-render", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";

// dsh-md-html-render — CLIENT half.
//
// Mounts a header button and a right-side drawer. The Markdown renderer is
// hand-written: the client half loads as a plain script with no bundler, so
// pulling in marked/markdown-it is not an option. That constraint is also the
// feature — no dependency tree, nothing to audit but this file.
//
// Every scrap of user text is HTML-escaped before any inline syntax runs, so a
// document containing raw <script> renders as literal characters.

var React = require("react");

var CHANNEL = "/dsh-md-html-render";

// `.mdp-cwdp` is `direction:rtl` so that `text-overflow:ellipsis` trims a long
// path from the *front* and keeps the deepest directory visible. The cost is
// that a leading run of bidi-neutral characters — exactly what "~/" is — gets
// reordered to the far end, so `~/projects/app` displayed as `projects/app/~`.
// A leading U+200E (LEFT-TO-RIGHT MARK) anchors the run as LTR without
// disturbing the front-truncation. Measured against `unicode-bidi:plaintext`,
// which fixes the order but flips the ellipsis back to the tail, and against a
// trailing LRM, which changes nothing.
var LRM = "‎";
var displayPath = function (path) {
  return path ? LRM + path : "…";
};

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

var STRINGS = {
  en: {
    title: "Markdown Preview", button: "MD", buttonHint: "Markdown preview drawer",
    edit: "Edit", preview: "Preview", exportBtn: "Export", close: "Close", up: "Up",
    emptyDir: "Nothing to open in this directory.",
    placeholder: "Type or paste Markdown here…",
    pickFile: "Pick a file to preview", lines: "lines",
    exported: "Exported to ", opened: "Opened ",
    errDir: "Could not read the directory.", errUp: "Could not go up.",
    errRead: "Could not read the file.", errExport: "Export failed.",
  },
  zh: {
    title: "Markdown 预览", button: "MD", buttonHint: "Markdown 侧边预览",
    edit: "编辑", preview: "预览", exportBtn: "导出", close: "关闭", up: "上级",
    emptyDir: "当前目录没有可打开的内容。",
    placeholder: "在这里输入或粘贴 Markdown…",
    pickFile: "点击文件开始预览", lines: "行",
    exported: "已导出至 ", opened: "已打开 ",
    errDir: "读取目录失败。", errUp: "返回上级失败。",
    errRead: "读取文件失败。", errExport: "导出失败。",
  },
};

function pickStrings() {
  var lang = "";
  try { lang = String(navigator.language || "").toLowerCase(); } catch (e) { lang = ""; }
  return lang.indexOf("zh") === 0 ? STRINGS.zh : STRINGS.en;
}

// ---------------------------------------------------------------------------
// Markdown -> HTML
// ---------------------------------------------------------------------------

var esc = function (s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

// Anything that is not plainly http(s), an anchor, a root-relative path or
// mailto collapses to "#". This is what stops javascript: and data: URLs.
var safeUrl = function (url) {
  var t = String(url).trim();
  return /^(https?:|#|\/|mailto:)/i.test(t) ? t : "#";
};

function inline(src) {
  // Code spans are lifted out first so their contents never get treated as
  // emphasis or link syntax, then restored after escaping.
  var codes = [];
  var s = String(src).replace(/`([^`]+)`/g, function (m, c) {
    codes.push(esc(c));
    return "\u0000" + (codes.length - 1) + "\u0000";
  });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, function (m, alt, url) {
    return '<img src="' + safeUrl(url) + '" alt="' + alt + '" />';
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, function (m, text, url) {
    return '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener noreferrer">' + text + "</a>";
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return "<code>" + codes[+i] + "</code>"; });
  return s;
}

function blockFrom(lines) {
  var out = [];
  var i = 0;
  var para = [];
  var flushPara = function () {
    if (para.length) {
      out.push("<p>" + para.map(inline).join("<br />") + "</p>");
      para = [];
    }
  };
  while (i < lines.length) {
    var line = String(lines[i]);
    var t = line.trim();
    if (t === "") { flushPara(); i++; continue; }

    var fence = t.match(/^```(\w*)\s*$/);
    if (fence) {
      flushPara();
      var lang = fence[1];
      var body = [];
      i++;
      while (i < lines.length && !/^```/.test(String(lines[i]).trim())) { body.push(String(lines[i])); i++; }
      i++;
      out.push('<pre class="mdp-code"><code' + (lang ? ' data-lang="' + esc(lang) + '"' : "") + ">" +
        esc(body.join("\n")) + "</code></pre>");
      continue;
    }

    var h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      var lv = h[1].length;
      out.push("<h" + lv + ">" + inline(h[2]) + "</h" + lv + ">");
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); out.push("<hr />"); i++; continue; }

    if (/^>/.test(line)) {
      flushPara();
      var quote = [];
      while (i < lines.length && /^>/.test(String(lines[i]))) { quote.push(String(lines[i]).replace(/^>\s?/, "")); i++; }
      out.push("<blockquote>" + blockFrom(quote).join("") + "</blockquote>");
      continue;
    }

    var ul = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    var ol = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      var tag = ol ? "ol" : "ul";
      var items = [];
      while (i < lines.length) {
        var m = /^(\s*)(?:[-*+]\s+|\d+[.)]\s+)(.*)$/.exec(String(lines[i]));
        if (!m) break;
        var content = m[2];
        var task = /^\[( |x|X)\]\s+(.*)$/.exec(content);
        var inner;
        if (task) {
          inner = '<input type="checkbox" disabled' + (task[1].toLowerCase() === "x" ? " checked" : "") +
            " /> " + inline(task[2]);
        } else {
          inner = inline(content);
        }
        items.push("<li>" + inner + "</li>");
        i++;
        // Lazy continuation: indented lines fold into the item above.
        while (i < lines.length && /^\s{2,}\S/.test(String(lines[i])) &&
          !/^(\s*)(?:[-*+]\s+|\d+[.)]\s+)/.test(String(lines[i]))) {
          items[items.length - 1] = items[items.length - 1]
            .replace("</li>", "<br />" + inline(String(lines[i]).trim()) + "</li>");
          i++;
        }
      }
      out.push("<" + tag + ">" + items.join("") + "</" + tag + ">");
      continue;
    }

    if (t.charAt(0) === "|") {
      flushPara();
      var rows = [];
      while (i < lines.length && String(lines[i]).trim().charAt(0) === "|") { rows.push(String(lines[i]).trim()); i++; }
      var isSep = rows.length >= 2 && /^\|[\s:|-]+\|$/.test(rows[1]) && rows[1].indexOf("-") !== -1;
      if (isSep) {
        var cells = function (r) { return r.split("|").slice(1, -1).map(function (c) { return c.trim(); }); };
        var html = "<table><thead><tr>";
        html += cells(rows[0]).map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("");
        html += "</tr></thead><tbody>";
        for (var r = 2; r < rows.length; r++) {
          html += "<tr>" + cells(rows[r]).map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
        }
        out.push(html + "</tbody></table>");
      } else {
        // Not a real table — treat the run as ordinary paragraph text.
        rows.forEach(function (r) { para.push(r); });
      }
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return out;
}

function renderMarkdown(src) {
  return blockFrom(String(src || "").replace(/\r\n/g, "\n").split("\n")).join("");
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

var CSS =
  ".mdp-mask{position:fixed;inset:0;z-index:8800;background:color-mix(in srgb, var(--dsw-alias-bg-base,#000) 35%, transparent);}" +
  ".mdp-drawer{position:fixed;top:0;right:0;bottom:0;width:min(600px,88vw);z-index:8900;display:flex;flex-direction:column;" +
  "background:var(--dsw-alias-bg-layer-1,#fff);border-left:1px solid var(--dsw-alias-border-l1,#e5e7eb);box-shadow:-18px 0 48px rgba(0,0,0,.22);}" +
  ".mdp-toolbar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-layer-2,#fafafa);}" +
  ".mdp-toolbar .mdp-title{font-weight:600;font-size:13px;flex:1;color:var(--dsw-alias-label-primary,#111);}" +
  ".mdp-btn{border:1px solid var(--dsw-alias-border-l1,#d0d5dd);background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#111);" +
  "border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;}" +
  ".mdp-btn:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6);}" +
  ".mdp-btn.active{background:var(--dsw-alias-brand-primary,#0969da);color:#fff;border-color:transparent;}" +
  ".mdp-btn:disabled{opacity:.5;cursor:default;}" +
  ".mdp-cwd{padding:6px 14px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#57606a);background:var(--dsw-alias-bg-layer-2,#fafafa);border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);" +
  "display:flex;align-items:center;gap:8px;overflow:hidden;}" +
  ".mdp-cwd .mdp-cwdp{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left;}" +
  ".mdp-files{flex:0 0 auto;max-height:30%;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);padding:6px 8px;font-size:12.5px;}" +
  ".mdp-file{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:pointer;color:var(--dsw-alias-label-primary,#111);}" +
  ".mdp-file:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6);}" +
  ".mdp-file.active{background:var(--dsw-alias-bg-layer-2,#e8f0fe);}" +
  ".mdp-file.dim{opacity:.55;}" +
  ".mdp-file .mdp-fn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
  ".mdp-empty{color:var(--dsw-alias-label-secondary,#57606a);padding:6px 8px;font-size:12px;}" +
  ".mdp-body{flex:1;min-height:0;overflow:auto;padding:16px 18px;background:var(--dsw-alias-bg-base,#fff);}" +
  ".mdp-editor,.mdp-editor textarea{height:100%;}" +
  ".mdp-editor textarea{width:100%;min-height:300px;resize:none;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);outline:none;padding:12px;" +
  "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.65;color:var(--dsw-alias-label-primary,#111);background:var(--dsw-alias-bg-layer-1,#fff);border-radius:8px;}" +
  ".mdp-preview h1,.mdp-preview h2,.mdp-preview h3,.mdp-preview h4{line-height:1.3;margin:1.1em 0 .45em;color:var(--dsw-alias-label-primary,#111);}" +
  ".mdp-preview h1{font-size:1.6em;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);padding-bottom:.3em;}" +
  ".mdp-preview h2{font-size:1.3em;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);padding-bottom:.25em;}" +
  ".mdp-preview p{margin:.5em 0;line-height:1.7;color:var(--dsw-alias-label-primary,#111);font-size:13.5px;}" +
  ".mdp-preview a{color:var(--dsw-alias-brand-primary,#0969da);text-decoration:none;}" +
  ".mdp-preview code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;background:var(--dsw-alias-bg-layer-2,#f0f2f5);padding:2px 5px;border-radius:5px;}" +
  ".mdp-preview .mdp-code{background:var(--dsw-alias-bg-layer-2,#f6f8fa);border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;padding:12px 14px;overflow:auto;margin:.7em 0;}" +
  ".mdp-preview .mdp-code code{background:transparent;padding:0;font-size:12px;line-height:1.6;}" +
  ".mdp-preview blockquote{border-left:4px solid var(--dsw-alias-border-l2,#d0d7de);margin:.7em 0;padding:2px 14px;color:var(--dsw-alias-label-secondary,#57606a);}" +
  ".mdp-preview ul,.mdp-preview ol{padding-left:1.6em;margin:.5em 0;line-height:1.7;}" +
  ".mdp-preview input[type=checkbox]{margin-right:6px;accent-color:var(--dsw-alias-brand-primary,#0969da);}" +
  ".mdp-preview table{border-collapse:collapse;width:100%;margin:.8em 0;font-size:13px;}" +
  ".mdp-preview th,.mdp-preview td{border:1px solid var(--dsw-alias-border-l1,#d0d7de);padding:6px 10px;text-align:left;}" +
  ".mdp-preview th{background:var(--dsw-alias-bg-layer-2,#f6f8fa);font-weight:600;}" +
  ".mdp-preview img{max-width:100%;border-radius:6px;}" +
  ".mdp-preview hr{border:0;border-top:1px solid var(--dsw-alias-border-l1,#d0d7de);margin:1.2em 0;}" +
  ".mdp-status{display:flex;gap:14px;padding:6px 14px;border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb);font-size:11px;color:var(--dsw-alias-label-secondary,#57606a);background:var(--dsw-alias-bg-layer-2,#fafafa);}" +
  ".mdp-status .mdp-err{color:var(--dsw-alias-state-error-primary,#d1242f);}" +
  ".mdp-status .mdp-ok{color:var(--dsw-alias-state-success-primary,#1a7f37);}";

module.exports = {
  name: "dsh-md-html-render",

  inject: ["slots", "connection"],

  apply: function (ctx) {
    var slots = ctx.slots;
    if (slots === undefined) return;

    var t = pickStrings();
    var call = function (endpoint, payload) {
      return ctx.connection.rpc.call(CHANNEL, endpoint, payload || {});
    };

    var styleEl = document.createElement("style");
    styleEl.setAttribute("data-dsh-md-html-render", "");
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    var WELCOME = [
      "# " + t.title,
      "",
      "Pick a file from the list above to render it.",
      "",
      "- Click a folder to descend, **Up** to go back",
      "- Toggle **Edit** to scratch in the buffer",
      "- **Export** writes a standalone HTML page next to the file",
      "",
      "```js",
      "const hi = (name) => `Hello, ${name}!`",
      "```",
      "",
      "| Feature | Status |",
      "| --- | --- |",
      "| Directory navigation | yes |",
      "| Standalone HTML export | yes |",
      "| Runtime dependencies | none |",
    ].join("\n");

    // One store shared by the header button and the drawer, so the button can
    // reflect open state without the two components being nested.
    var state = {
      open: false, edit: false, text: WELCOME, cwd: "", items: [], active: "",
      notice: "", error: "", busy: false, loaded: false,
    };
    var listeners = new Set();
    var setState = function (patch) {
      Object.assign(state, patch);
      listeners.forEach(function (fn) { fn(); });
    };

    function useStore() {
      var pair = React.useState(0);
      var force = pair[1];
      React.useEffect(function () {
        var fn = function () { force(function (x) { return x + 1; }); };
        listeners.add(fn);
        return function () { listeners.delete(fn); };
      }, []);
      return state;
    }

    var join = function (dir, entry) {
      var base = String(dir);
      return base.endsWith("/") ? base + String(entry) : base + "/" + String(entry);
    };

    var applyListing = function (res, fallbackMessage, extra) {
      if (res && res.ok) {
        setState(Object.assign({ cwd: res.path, items: res.items || [], busy: false }, extra || {}));
      } else {
        setState({ busy: false, error: (res && res.error) || fallbackMessage });
      }
    };

    var loadDirectory = async function (path) {
      setState({ busy: true, error: "", notice: "" });
      try {
        applyListing(await call("ls", { path: path }), t.errDir, { active: "", loaded: true });
      } catch (error) {
        setState({ busy: false, error: String(error) });
      }
    };

    function HeaderButton() {
      var s = useStore();
      return React.createElement("button", {
        "aria-label": t.buttonHint,
        title: t.buttonHint,
        onClick: function () {
          // `s` and `state` are the same object, so read the current value
          // before mutating it — testing after setState always sees the new one.
          var wasOpen = s.open;
          setState({ open: !wasOpen });
          if (!wasOpen && !state.loaded) loadDirectory("");
        },
        style: {
          border: 0, background: "transparent", cursor: "pointer", borderRadius: 8,
          padding: "5px 8px", fontSize: 12.5, fontWeight: 600,
          color: s.open ? "var(--dsw-alias-brand-primary,#0969da)" : "var(--dsw-alias-label-secondary,#57606a)",
        },
      }, t.button);
    }

    function Panel() {
      var s = useStore();
      var html = renderMarkdown(s.text);
      var lineCount = s.text.split("\n").length;

      var goUp = async function () {
        setState({ busy: true, error: "", notice: "" });
        try {
          applyListing(await call("up", { path: s.cwd }), t.errUp, { active: "" });
        } catch (error) {
          setState({ busy: false, error: String(error) });
        }
      };

      var openFile = async function (entryName) {
        setState({ busy: true, error: "", notice: "", active: String(entryName) });
        try {
          var res = await call("readFile", { path: join(s.cwd, String(entryName)) });
          if (res && res.ok) setState({ text: res.content || "", busy: false, notice: t.opened + entryName });
          else setState({ busy: false, error: (res && res.error) || t.errRead });
        } catch (error) {
          setState({ busy: false, error: String(error) });
        }
      };

      var onExport = async function () {
        setState({ busy: true, error: "", notice: "" });
        var stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        var title = s.active || "Markdown";
        try {
          // The host renders and wraps, so an exported page is byte-identical
          // to what the md_html_render tool produces for the same source.
          var res = await call("renderExport", {
            dir: s.cwd,
            name: (s.active ? s.active.replace(/\.[^.]+$/, "") : "md-export") + "-" + stamp + ".html",
            markdown: s.text,
            title: title,
          });
          if (res && res.ok) setState({ busy: false, notice: t.exported + res.path, error: "" });
          else setState({ busy: false, error: (res && res.error) || t.errExport, notice: "" });
        } catch (error) {
          setState({ busy: false, error: String(error) });
        }
      };

      var fileRows;
      if (!Array.isArray(s.items) || s.items.length === 0) {
        fileRows = React.createElement("div", { className: "mdp-empty" }, t.emptyDir);
      } else {
        fileRows = s.items.map(function (item) {
          var isDir = item.type === "directory";
          var openable = isDir || item.previewable;
          return React.createElement("div", {
            key: item.name,
            className: "mdp-file" +
              (!isDir && item.name === s.active ? " active" : "") +
              (openable ? "" : " dim"),
            onClick: function () {
              if (isDir) loadDirectory(join(s.cwd, item.name));
              else if (item.previewable) openFile(item.name);
            },
          }, [
            React.createElement("span", { key: "i" }, isDir ? "📁" : "📄"),
            React.createElement("span", { key: "n", className: "mdp-fn" }, item.name),
          ]);
        });
      }

      return React.createElement("div", {
        className: "mdp-mask",
        onClick: function () { setState({ open: false }); },
      }, React.createElement("div", {
        className: "mdp-drawer",
        onClick: function (event) { event.stopPropagation(); },
      }, [
        React.createElement("div", { key: "tb", className: "mdp-toolbar" }, [
          React.createElement("span", { key: "t", className: "mdp-title" }, t.title),
          React.createElement("button", {
            key: "e",
            className: "mdp-btn" + (s.edit ? " active" : ""),
            onClick: function () { setState({ edit: !s.edit }); },
          }, s.edit ? t.preview : t.edit),
          React.createElement("button", {
            key: "x", className: "mdp-btn", onClick: onExport, disabled: s.busy,
          }, t.exportBtn),
          React.createElement("button", {
            key: "c", className: "mdp-btn", "aria-label": t.close,
            onClick: function () { setState({ open: false }); },
          }, "✕"),
        ]),
        React.createElement("div", { key: "cwd", className: "mdp-cwd" }, [
          React.createElement("button", {
            key: "u", className: "mdp-btn", onClick: goUp, disabled: s.busy || !s.cwd, title: t.up,
          }, "↑"),
          React.createElement("span", { key: "p", className: "mdp-cwdp" }, displayPath(s.cwd)),
        ]),
        React.createElement("div", { key: "files", className: "mdp-files" }, fileRows),
        React.createElement("div", { key: "body", className: "mdp-body" },
          s.edit
            ? React.createElement("div", { className: "mdp-editor" },
                React.createElement("textarea", {
                  value: s.text,
                  onChange: function (event) { setState({ text: event.target.value }); },
                  placeholder: t.placeholder,
                  spellCheck: false,
                }))
            : React.createElement("div", {
                className: "mdp-preview",
                dangerouslySetInnerHTML: { __html: html },
              })),
        React.createElement("div", { key: "st", className: "mdp-status" }, [
          React.createElement("span", { key: "l" }, lineCount + " " + t.lines),
          React.createElement("span", { key: "a" }, s.active ? "📄 " + s.active : t.pickFile),
          React.createElement("span", {
            key: "m", className: s.error ? "mdp-err" : "mdp-ok",
          }, s.busy ? "…" : (s.error || s.notice || "")),
        ]),
      ]));
    }

    slots.inject("conversation.session.header.actions", function () {
      return slots.register(
        { name: "conversation.session.header.actions", id: "md-preview-button", order: 25, label: t.title },
        function () { return React.createElement(HeaderButton); },
      );
    });

    slots.inject("shell.overlay", function () {
      return slots.register(
        { name: "shell.overlay", id: "md-preview-panel", order: 90 },
        function () {
          var s = useStore();
          return s.open ? React.createElement(Panel) : null;
        },
      );
    });

    ctx.on("dispose", function () {
      if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      listeners.clear();
    });
  },
};

return module.exports; } });
