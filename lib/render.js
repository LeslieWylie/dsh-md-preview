// dsh-md-preview — Markdown renderer, host side.
//
// This is the same renderer the web client half runs, kept as a plain ESM
// module so the model-facing `md_html_render` tool and the GUI drawer's
// Export button produce byte-identical pages. `tests/render.test.cjs` asserts
// that parity on every case in the corpus; if the two ever drift, the suite
// fails rather than shipping two subtly different Markdown dialects.
//
// Zero dependencies, by construction: the client half loads as a plain script
// with no bundler, so anything it cannot import, this file does not use.

/** Escape the five characters that can break out of HTML text or an attribute. */
export const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Anything that is not plainly http(s), an anchor, a root-relative path or
 * mailto collapses to "#". This is what stops javascript: and data: URLs.
 */
export const safeUrl = (url) => {
  const trimmed = String(url).trim()
  return /^(https?:|#|\/|mailto:)/i.test(trimmed) ? trimmed : '#'
}

// Placeholder bracketing an extracted code span. It has to be a character that
// cannot appear in Markdown source: anything printable -- a space especially --
// would make ordinary prose like "chapter 5 is" round-trip back out as a code
// span. Built with fromCharCode so this file stays plain text; a literal NUL
// byte in the source would make git treat it as binary.
const SENTINEL = String.fromCharCode(0)
const SENTINEL_PATTERN = new RegExp(SENTINEL + '(\\d+)' + SENTINEL, 'g')

const inline = (src) => {
  // Code spans are lifted out first so their contents never get treated as
  // emphasis or link syntax, then restored after escaping.
  const codes = []
  let s = String(src).replace(/`([^`]+)`/g, (m, c) => {
    codes.push(escapeHtml(c))
    return SENTINEL + (codes.length - 1) + SENTINEL
  })
  s = escapeHtml(s)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (m, alt, url) =>
    '<img src="' + safeUrl(url) + '" alt="' + alt + '" />')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (m, text, url) =>
    '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  s = s.replace(SENTINEL_PATTERN, (m, i) => '<code>' + codes[+i] + '</code>')
  return s
}

const blockFrom = (lines) => {
  const out = []
  let i = 0
  let para = []
  const flushPara = () => {
    if (para.length) {
      out.push('<p>' + para.map(inline).join('<br />') + '</p>')
      para = []
    }
  }

  while (i < lines.length) {
    const line = String(lines[i])
    const t = line.trim()
    if (t === '') { flushPara(); i++; continue }

    const fence = t.match(/^```(\w*)\s*$/)
    if (fence) {
      flushPara()
      const lang = fence[1]
      const body = []
      i++
      while (i < lines.length && !/^```/.test(String(lines[i]).trim())) { body.push(String(lines[i])); i++ }
      i++
      out.push('<pre class="mdp-code"><code' + (lang ? ' data-lang="' + escapeHtml(lang) + '"' : '') + '>' +
        escapeHtml(body.join('\n')) + '</code></pre>')
      continue
    }

    const h = t.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushPara()
      const level = h[1].length
      out.push('<h' + level + '>' + inline(h[2]) + '</h' + level + '>')
      i++
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); out.push('<hr />'); i++; continue }

    if (/^>/.test(line)) {
      flushPara()
      const quote = []
      while (i < lines.length && /^>/.test(String(lines[i]))) { quote.push(String(lines[i]).replace(/^>\s?/, '')); i++ }
      out.push('<blockquote>' + blockFrom(quote).join('') + '</blockquote>')
      continue
    }

    const ul = /^(\s*)[-*+]\s+(.*)$/.exec(line)
    const ol = /^(\s*)\d+[.)]\s+(.*)$/.exec(line)
    if (ul || ol) {
      flushPara()
      const tag = ol ? 'ol' : 'ul'
      const items = []
      while (i < lines.length) {
        const m = /^(\s*)(?:[-*+]\s+|\d+[.)]\s+)(.*)$/.exec(String(lines[i]))
        if (!m) break
        const content = m[2]
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(content)
        const inner = task
          ? '<input type="checkbox" disabled' + (task[1].toLowerCase() === 'x' ? ' checked' : '') +
            ' /> ' + inline(task[2])
          : inline(content)
        items.push('<li>' + inner + '</li>')
        i++
        // Lazy continuation: indented lines fold into the item above.
        while (i < lines.length && /^\s{2,}\S/.test(String(lines[i])) &&
          !/^(\s*)(?:[-*+]\s+|\d+[.)]\s+)/.test(String(lines[i]))) {
          items[items.length - 1] = items[items.length - 1]
            .replace('</li>', '<br />' + inline(String(lines[i]).trim()) + '</li>')
          i++
        }
      }
      out.push('<' + tag + '>' + items.join('') + '</' + tag + '>')
      continue
    }

    if (t.charAt(0) === '|') {
      flushPara()
      const rows = []
      while (i < lines.length && String(lines[i]).trim().charAt(0) === '|') { rows.push(String(lines[i]).trim()); i++ }
      const isSep = rows.length >= 2 && /^\|[\s:|-]+\|$/.test(rows[1]) && rows[1].indexOf('-') !== -1
      if (isSep) {
        const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim())
        let html = '<table><thead><tr>'
        html += cells(rows[0]).map((c) => '<th>' + inline(c) + '</th>').join('')
        html += '</tr></thead><tbody>'
        for (let r = 2; r < rows.length; r++) {
          html += '<tr>' + cells(rows[r]).map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>'
        }
        out.push(html + '</tbody></table>')
      } else {
        // Not a real table — treat the run as ordinary paragraph text.
        rows.forEach((r) => para.push(r))
      }
      continue
    }

    para.push(line)
    i++
  }

  flushPara()
  return out
}

/** Render Markdown source to an HTML fragment. */
export const renderMarkdown = (src) =>
  blockFrom(String(src === undefined || src === null ? '' : src).replace(/\r\n/g, '\n').split('\n')).join('')

/**
 * The exported page is standalone, so it carries its own copy of the styles
 * rather than referencing the harness theme variables it will not have.
 */
export const EXPORT_CSS =
  'body{max-width:860px;margin:40px auto;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#24292f;line-height:1.7}' +
  'code{background:#f0f2f5;padding:2px 5px;border-radius:5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}' +
  'pre{background:#f6f8fa;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;overflow:auto}' +
  'pre code{background:transparent;padding:0}' +
  'table{border-collapse:collapse;width:100%}th,td{border:1px solid #d0d7de;padding:7px 12px;text-align:left}' +
  'th{background:#f6f8fa}blockquote{border-left:4px solid #d0d7de;margin:.7em 0;padding:2px 14px;color:#57606a}' +
  'img{max-width:100%}hr{border:0;border-top:1px solid #d0d7de;margin:1.2em 0}' +
  'h1,h2{border-bottom:1px solid #e5e7eb;padding-bottom:.3em}' +
  '@media(prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}code{background:#161b22}' +
  'pre{background:#161b22;border-color:#30363d}th{background:#161b22}th,td{border-color:#30363d}}'

/**
 * Wrap a rendered fragment in a self-contained page. No external stylesheet,
 * font, or script, so the file opens from disk, from a share, or from an
 * airgapped machine and still looks the same.
 */
export const standaloneHtml = (title, bodyHtml) =>
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' + escapeHtml(title === undefined || title === null || title === '' ? 'Markdown' : title) +
  '</title><style>' + EXPORT_CSS + '</style></head><body>' +
  String(bodyHtml === undefined || bodyHtml === null ? '' : bodyHtml) +
  '</body></html>'

/** Render Markdown straight to a standalone page. */
export const renderStandalone = (markdown, title) =>
  standaloneHtml(title, renderMarkdown(markdown))
