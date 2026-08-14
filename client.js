// ============================================================================
// md-preview plugin — CLIENT half (v2: drawer sidebar preview with nav)
// Mounted into:
//   - conversation.session.header.actions (id: md-preview-drawer) -> header "MD"
//   - shell.overlay (id: md-preview-panel) -> right-side drawer (no full mask)
// UX: click header "MD" -> drawer opens, lists the current workspace root;
// click a directory to enter, click/double-click a .md file to render it.
// Preview / Edit modes toggled in the toolbar; Export writes standalone HTML
// into the current directory. Theme-aware via --dsw-alias-* variables.
// All user text is escaped before inline processing (no raw HTML executed).
// ============================================================================
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    // ---- tiny markdown -> html (self-contained, no imports) ----
    const esc = (s) => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const safeUrl = (u) => {
      const t = String(u).trim()
      if (/^(https?:|#|\/|mailto:)/i.test(t)) return t
      return '#'
    }
    function inline(src) {
      const codes = []
      let s = String(src).replace(/`([^`]+)`/g, (m, c) => {
        codes.push(esc(c))
        return '\u0000' + (codes.length - 1) + '\u0000'
      })
      s = esc(s)
      s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (m, alt, url) =>
        '<img src="' + safeUrl(url) + '" alt="' + alt + '" />')
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (m, text, url) =>
        '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>')
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
      s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + codes[+i] + '</code>')
      return s
    }
    function blockFrom(lines) {
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
          out.push('<pre class="mdp-code"><code' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '>' +
            esc(body.join('\n')) + '</code></pre>')
          continue
        }
        const h = t.match(/^(#{1,6})\s+(.*)$/)
        if (h) { flushPara(); const lv = h[1].length; out.push('<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>'); i++; continue }
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); out.push('<hr />'); i++; continue }
        if (/^>/.test(line)) {
          flushPara()
          const body = []
          while (i < lines.length && /^>/.test(String(lines[i]))) { body.push(String(lines[i]).replace(/^>\s?/, '')); i++ }
          out.push('<blockquote>' + blockFrom(body).join('') + '</blockquote>')
          continue
        }
        const ul = /^(\s*)[-*+]\s+(.*)$/.exec(line)
        const ol = /^(\s*)\d+[.)]\s+(.*)$/.exec(line)
        if (ul || ol) {
          flushPara()
          const ordered = !!ol
          const tag = ordered ? 'ol' : 'ul'
          const items = []
          while (i < lines.length) {
            const m = /^(\s*)(?:[-*+]\s+|\d+[.)]\s+)(.*)$/.exec(String(lines[i]))
            if (!m) break
            let content = m[2]
            const task = /^\[( |x|X)\]\s+(.*)$/.exec(content)
            let inner = ''
            if (task) {
              const checked = task[1].toLowerCase() === 'x'
              inner = '<input type="checkbox" disabled' + (checked ? ' checked' : '') + ' /> ' + inline(task[2])
            } else {
              inner = inline(content)
            }
            items.push('<li>' + inner + '</li>')
            i++
            while (i < lines.length && /^\s{2,}\S/.test(String(lines[i])) &&
              !/^(\s*)(?:[-*+]\s+|\d+[.)]\s+)/.test(String(lines[i]))) {
              items[items.length - 1] = items[items.length - 1].replace('</li>',
                '<br />' + inline(String(lines[i]).trim()) + '</li>')
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
            html += '</tbody></table>'
            out.push(html)
          } else {
            para.push(line)
            i++
          }
          continue
        }
        para.push(line)
        i++
      }
      flushPara()
      return out
    }
    const renderMarkdown = (src) =>
      blockFrom(String(src || '').replace(/\r\n/g, '\n').split('\n')).join('')

    const DEMO = '# Markdown 侧边预览\n\n' +
      '点击会话头部「MD 预览」打开右侧抽屉。\n\n' +
      '## 怎么用\n\n' +
      '- 上方短条显示**当前目录**，⬆ 按钮返回上级\n- 文件区：点目录进入、点 `.md` 文件即预览\n- 工具栏可切换 **预览 / 编辑** 模式\n\n' +
      '### 支持的语法\n\n' +
      '```js\nconst hi = (n) => `Hello, ${n}!`\n```\n\n' +
      '- [x] 点文件直接侧边预览\n- [ ] 导出 HTML\n\n' +
      '| 功能 | 状态 |\n| --- | --- |\n| 侧边抽屉 | ✅ |\n| 目录导航 | ✅ |'

    const state = {
      open: false, edit: false, text: DEMO, cwd: '', items: [], active: '',
      notice: '', error: '', busy: false, loaded: false,
    }
    const listeners = new Set()
    const setState = (patch) => {
      Object.assign(state, patch)
      listeners.forEach((fn) => fn())
    }
    function useStore() {
      const [, force] = React.useState(0)
      React.useEffect(() => {
        const fn = () => force((x) => x + 1)
        listeners.add(fn)
        return () => listeners.delete(fn)
      }, [])
      return state
    }
    const join = (d, n) => (String(d).endsWith('/') ? String(d) + String(n) : String(d) + '/' + String(n))

    const disposeCss = styles.insert(
      '.mdp-mask{position:fixed;inset:0;z-index:8800;background:color-mix(in srgb, var(--dsw-alias-bg-base,#000) 35%, transparent);}' +
      '.mdp-drawer{position:fixed;top:0;right:0;bottom:0;width:min(600px,88vw);z-index:8900;display:flex;flex-direction:column;' +
      'background:var(--dsw-alias-bg-layer-1,#fff);border-left:1px solid var(--dsw-alias-border-l1,#e5e7eb);box-shadow:-18px 0 48px rgba(0,0,0,.22);}' +
      '.mdp-toolbar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-layer-2,#fafafa);}' +
      '.mdp-toolbar .mdp-title{font-weight:600;font-size:13px;color:var(--dsw-alias-label-primary,#111);}' +
      '.mdp-btn{border:1px solid var(--dsw-alias-border-l1,#d0d5dd);background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#111);' +
      'border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;}' +
      '.mdp-btn:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6);}' +
      '.mdp-btn.active{background:var(--dsw-alias-brand-primary,#0969da);color:#fff;border-color:transparent;}' +
      '.mdp-btn:disabled{opacity:.5;cursor:default;}' +
      '.mdp-cwd{padding:6px 14px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#57606a);background:var(--dsw-alias-bg-layer-2,#fafafa);border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);' +
      'display:flex;align-items:center;gap:8px;overflow:hidden;}' +
      '.mdp-cwd .mdp-cwdp{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.mdp-files{flex:0 0 auto;max-height:30%;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);padding:6px 8px;font-size:12.5px;}' +
      '.mdp-file{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:pointer;color:var(--dsw-alias-label-primary,#111);}' +
      '.mdp-file:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6);}' +
      '.mdp-file.active{background:var(--dsw-alias-bg-layer-2,#e8f0fe);}' +
      '.mdp-file .mdp-fn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.mdp-empty{color:var(--dsw-alias-label-secondary,#57606a);padding:6px 8px;font-size:12px;}' +
      '.mdp-body{flex:1;min-height:0;overflow:auto;padding:16px 18px;background:var(--dsw-alias-bg-base,#fff);}' +
      '.mdp-editor textarea{width:100%;height:100%;min-height:300px;resize:none;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);outline:none;padding:12px;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.65;color:var(--dsw-alias-label-primary,#111);background:var(--dsw-alias-bg-layer-1,#fff);border-radius:8px;}' +
      '.mdp-preview h1,.mdp-preview h2,.mdp-preview h3,.mdp-preview h4{line-height:1.3;margin:1.1em 0 .45em;color:var(--dsw-alias-label-primary,#111);}' +
      '.mdp-preview h1{font-size:1.6em;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);padding-bottom:.3em;}' +
      '.mdp-preview h2{font-size:1.3em;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);padding-bottom:.25em;}' +
      '.mdp-preview p{margin:.5em 0;line-height:1.7;color:var(--dsw-alias-label-primary,#111);font-size:13.5px;}' +
      '.mdp-preview a{color:var(--dsw-alias-brand-primary,#0969da);text-decoration:none;}' +
      '.mdp-preview code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;background:var(--dsw-alias-bg-layer-2,#f0f2f5);padding:2px 5px;border-radius:5px;}' +
      '.mdp-preview .mdp-code{background:var(--dsw-alias-bg-layer-2,#f6f8fa);border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;padding:12px 14px;overflow:auto;margin:.7em 0;}' +
      '.mdp-preview .mdp-code code{background:transparent;padding:0;font-size:12px;line-height:1.6;}' +
      '.mdp-preview blockquote{border-left:4px solid var(--dsw-alias-border-l2,#d0d7de);margin:.7em 0;padding:2px 14px;color:var(--dsw-alias-label-secondary,#57606a);}' +
      '.mdp-preview ul,.mdp-preview ol{padding-left:1.6em;margin:.5em 0;line-height:1.7;}' +
      '.mdp-preview input[type=checkbox]{margin-right:6px;accent-color:var(--dsw-alias-brand-primary,#0969da);}' +
      '.mdp-preview table{border-collapse:collapse;width:100%;margin:.8em 0;font-size:13px;}' +
      '.mdp-preview th,.mdp-preview td{border:1px solid var(--dsw-alias-border-l1,#d0d7de);padding:6px 10px;text-align:left;}' +
      '.mdp-preview th{background:var(--dsw-alias-bg-layer-2,#f6f8fa);font-weight:600;}' +
      '.mdp-preview img{max-width:100%;border-radius:6px;}' +
      '.mdp-preview hr{border:0;border-top:1px solid var(--dsw-alias-border-l1,#d0d7de);margin:1.2em 0;}' +
      '.mdp-status{display:flex;gap:14px;padding:6px 14px;border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb);font-size:11px;color:var(--dsw-alias-label-secondary,#57606a);background:var(--dsw-alias-bg-layer-2,#fafafa);}' +
      '.mdp-status .mdp-err{color:var(--dsw-alias-state-error-primary,#d1242f);}' +
      '.mdp-status .mdp-ok{color:var(--dsw-alias-state-success-primary,#1a7f37);}'
    )

    const defaultName = () =>
      'md-export-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.html'

    function HeaderButton() {
      const s = useStore()
      return React.createElement('button', {
        'aria-label': 'MD 预览', title: 'Markdown 侧边预览',
        onClick: async () => {
          setState({ open: !s.open })
          if (!s.open && !state.loaded) {
            setState({ busy: true, error: '', notice: '' })
            try {
              const res = await host.call('md/ls', { path: '' })
              if (res && res.ok) setState({ cwd: res.path, items: res.items || [], loaded: true, busy: false })
              else setState({ busy: false, error: (res && res.error) || '读取目录失败' })
            } catch (e) { setState({ busy: false, error: String(e) }) }
          }
        },
        style: {
          border: 0, background: 'transparent', cursor: 'pointer', borderRadius: 8,
          padding: '5px 8px', fontSize: 12.5, fontWeight: 600,
          color: s.open ? 'var(--dsw-alias-brand-primary,#0969da)' : 'var(--dsw-alias-label-secondary,#57606a)',
        },
      }, 'MD')
    }

    function Panel() {
      const s = useStore()
      const html = renderMarkdown(s.text)
      const lines = s.text.split('\n').length
      const openDir = async (name) => {
        setState({ busy: true, error: '', notice: '' })
        try {
          const res = await host.call('md/ls', { path: join(s.cwd, name) })
          if (res && res.ok) setState({ cwd: res.path, items: res.items || [], active: '', busy: false })
          else setState({ busy: false, error: (res && res.error) || '打开目录失败' })
        } catch (e) { setState({ busy: false, error: String(e) }) }
      }
      const goUp = async () => {
        setState({ busy: true, error: '', notice: '' })
        try {
          const res = await host.call('md/up', { path: s.cwd })
          if (res && res.ok) setState({ cwd: res.path, items: res.items || [], active: '', busy: false })
          else setState({ busy: false, error: (res && res.error) || '返回上级失败' })
        } catch (e) { setState({ busy: false, error: String(e) }) }
      }
      const openFile = async (name) => {
        setState({ busy: true, error: '', notice: '', active: String(name) })
        try {
          const res = await host.call('md/readFile', { path: join(s.cwd, String(name)) })
          if (res && res.ok) setState({ text: res.content || '', busy: false, notice: '已打开 ' + name })
          else setState({ busy: false, error: (res && res.error) || '读取文件失败' })
        } catch (e) { setState({ busy: false, error: String(e) }) }
      }
      const onExport = async () => {
        setState({ busy: true, error: '', notice: '' })
        try {
          const res = await host.call('md/export', {
            dir: s.cwd, name: defaultName(),
            content: '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(s.active || 'Markdown') + '</title>' +
              '<style>body{max-width:860px;margin:40px auto;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#24292f;line-height:1.7}code{background:#f0f2f5;padding:2px 5px;border-radius:5px}pre{background:#f6f8fa;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;overflow:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d0d7de;padding:7px 12px;text-align:left}blockquote{border-left:4px solid #d0d7de;margin:.7em 0;padding:2px 14px;color:#57606a}img{max-width:100%}</style></head><body>' + html + '</body></html>',
          })
          if (res && res.ok) setState({ busy: false, notice: '已导出: ' + res.path, error: '' })
          else setState({ busy: false, error: (res && res.error) || '导出失败', notice: '' })
        } catch (e) { setState({ busy: false, error: String(e) }) }
      }
      return React.createElement('div', { className: 'mdp-mask', onClick: () => setState({ open: false }) }, [
        React.createElement('div', { className: 'mdp-drawer', onClick: (e) => e.stopPropagation() }, [
          React.createElement('div', { className: 'mdp-toolbar' }, [
            React.createElement('span', { className: 'mdp-title' }, 'Markdown 侧边预览'),
            React.createElement('button', { className: 'mdp-btn' + (s.edit ? ' active' : ''), onClick: () => setState({ edit: !s.edit }) },
              s.edit ? '预览' : '编辑'),
            React.createElement('button', { className: 'mdp-btn', onClick: onExport, disabled: s.busy }, '导出'),
            React.createElement('button', { className: 'mdp-btn', onClick: () => setState({ open: false }) }, '✕'),
          ]),
          React.createElement('div', { className: 'mdp-cwd' }, [
            React.createElement('button', { className: 'mdp-btn', onClick: goUp, disabled: s.busy || !s.cwd }, '⬆'),
            React.createElement('span', { className: 'mdp-cwdp' }, s.cwd || '…'),
          ]),
          React.createElement('div', { className: 'mdp-files' },
            Array.isArray(s.items) && s.items.length === 0
              ? React.createElement('div', { className: 'mdp-empty' }, '（空目录，或当前目录没有可打开项）')
              : (s.items || []).map((it) =>
                  React.createElement('div', {
                    className: 'mdp-file' + (it.type === 'file' && it.name === s.active ? ' active' : ''),
                    key: it.name,
                    onClick: () => (it.type === 'directory' ? openDir(it.name) : openFile(it.name)),
                    onDoubleClick: () => (it.type === 'directory' ? openDir(it.name) : openFile(it.name)),
                  }, [
                    React.createElement('span', null, it.type === 'directory' ? '📁' : '📄'),
                    React.createElement('span', { className: 'mdp-fn' }, it.name),
                  ]))),
          React.createElement('div', { className: 'mdp-body' }, [
            s.edit
              ? React.createElement('div', { className: 'mdp-editor' }, [
                  React.createElement('textarea', {
                    value: s.text,
                    onChange: (e) => setState({ text: e.target.value }),
                    placeholder: '在这里输入或粘贴 Markdown…',
                    spellCheck: false,
                  }),
                ])
              : React.createElement('div', { className: 'mdp-preview', dangerouslySetInnerHTML: { __html: html } }),
          ]),
          React.createElement('div', { className: 'mdp-status' }, [
            React.createElement('span', null, lines + ' 行'),
            React.createElement('span', null, s.active ? '📄 ' + s.active : '点文件开始预览'),
            React.createElement('span', { className: s.error ? 'mdp-err' : 'mdp-ok' }, s.busy ? '…' : (s.error || s.notice || '')),
          ]),
        ]),
      ])
    }

    // ---------- slots ----------
    slots.inject('conversation.session.header.actions', () => slots.register(
      { name: 'conversation.session.header.actions', id: 'md-preview-drawer', order: 25, label: 'MD 预览' },
      () => React.createElement(HeaderButton),
    ))
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'md-preview-panel', order: 90 },
      () => {
        const s = useStore()
        return s.open ? React.createElement(Panel) : null
      },
    ))

    ctx.on('dispose', () => {
      try { disposeCss() } catch (e) { /* noop */ }
    })
  },
}