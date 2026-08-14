// Regenerate the README screenshots.
//
//   node docs/screenshot.mjs                 # writes docs/*.html
//   node docs/screenshot.mjs --shoot         # ...and drives headless Chrome
//
// Neither image is a mockup. The drawer still is assembled from the CSS string
// sliced out of lib/client.js (not retyped, so it cannot drift) and the body
// html comes from renderMarkdown(); the export still is literally what
// renderStandalone() writes when you press Export. If the plugin's styling
// changes, rerun this and the screenshots follow.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderMarkdown, renderStandalone } from '../lib/render.js'

const here = (name) => fileURLToPath(new URL(name, import.meta.url))
const CHROME = process.env.CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// ---------------------------------------------------------------------------
// the plugin's own stylesheet, lifted from the client half
// ---------------------------------------------------------------------------

function clientCss() {
  const source = readFileSync(here('../lib/client.js'), 'utf8')
  const start = source.indexOf('var CSS =') + 'var CSS ='.length
  const stop = source.indexOf('module.exports', start)
  if (start < 20 || stop < 0) throw new Error('could not locate the CSS statement in lib/client.js')
  // The statement ends at the last `";` before module.exports. Semicolons also
  // appear *inside* the css literals, so scanning forward for the first one
  // cuts mid-string.
  const expr = source.slice(start, source.lastIndexOf('";', stop) + 1)
  const css = Function(`"use strict"; return (${expr});`)()
  if (!css.includes('.mdp-drawer')) throw new Error('extracted css does not look like the drawer stylesheet')
  return css
}

const DOC = `# Release notes

A **side-drawer Markdown preview**. Browse the working directory, pick a
\`.md\` file — it renders instantly, in the session, without leaving the app.

## What landed

- [x] Installable package — no more pasting JS into \`cordis_define\`
- [x] \`md_html_render\` tool merged in
- [ ] Syntax highlighting

| Capability | Before | Now |
|---|---|---|
| Install | paste by hand | \`dsh plugin add\` |
| Survives restart | no | yes |

> The client sandbox has no bundler, so the parser is hand-written pure JS.
> Every string is escaped **before** inline syntax runs.

\`\`\`js
const html = renderMarkdown(source)
drawer.replaceChildren(parse(html))
\`\`\`

Headings, ~~strikethrough~~, task lists, tables and [links](https://example.com).
`

// ---------------------------------------------------------------------------
// 1. the drawer, in situ
// ---------------------------------------------------------------------------

const FILES = [
  ['📁', 'docs', false],
  ['📁', 'skills', false],
  ['📄', 'README.md', true],
  ['📄', 'CHANGELOG.md', false],
  ['📄', 'RELEASE-NOTES.md', false],
]

// U+200E, exactly as displayPath() in lib/client.js prepends it.
const LRM = '‎'

const drawer = `<meta charset="utf-8"><style>
  html,body{margin:0;height:100%;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
  body{background:#f6f7f9;}
  .bg{padding:26px 34px;}
  .bg h4{margin:0 0 16px;color:#3d434c;font-size:15px;font-weight:600;}
  .bg .row{height:11px;border-radius:6px;background:#e4e7eb;margin:10px 0;}
${clientCss()}
</style>
<div class="bg"><h4>session</h4>
  ${[72, 54, 88, 41, 66, 79, 35, 60, 50, 74, 44].map(w => `<div class="row" style="width:${w}%"></div>`).join('\n  ')}
</div>
<div class="mdp-mask"><div class="mdp-drawer">
  <div class="mdp-toolbar">
    <span class="mdp-title">Markdown Preview</span>
    <button class="mdp-btn">Edit</button>
    <button class="mdp-btn">Export</button>
    <button class="mdp-btn">✕</button>
  </div>
  <div class="mdp-cwd">
    <button class="mdp-btn">↑</button>
    <span class="mdp-cwdp">${LRM}~/projects/dsh-md-preview</span>
  </div>
  <div class="mdp-files">
    ${FILES.map(([icon, name, active]) =>
      `<div class="mdp-file${active ? ' active' : ''}"><span>${icon}</span><span class="mdp-fn">${name}</span></div>`).join('\n    ')}
  </div>
  <div class="mdp-body"><div class="mdp-preview">${renderMarkdown(DOC)}</div></div>
  <div class="mdp-status"><span>28 lines</span><span>📄 README.md</span><span class="mdp-ok">rendered</span></div>
</div></div>`

// ---------------------------------------------------------------------------
// 2. what Export actually writes
// ---------------------------------------------------------------------------

// Same document, retitled — the point of the second shot is that Export writes
// the *same* render to a standalone file, so the body must stay identical.
const EXPORT_DOC = DOC.replace('# Release notes', '# Release notes — v0.2.2')

const SHOTS = [
  { name: 'drawer', html: drawer, size: '1120,745' },
  { name: 'export', html: renderStandalone(EXPORT_DOC, 'Release notes — v0.2.2'), size: '980,780' },
]

for (const shot of SHOTS) {
  writeFileSync(here(`${shot.name}.html`), shot.html)
  console.log(`wrote docs/${shot.name}.html`)
  if (!process.argv.includes('--shoot')) continue
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${shot.size}`,
    `--screenshot=${here(`${shot.name}.png`)}`,
    '--virtual-time-budget=2500',
    `file://${here(`${shot.name}.html`)}`,
  ], { stdio: 'ignore' })
  console.log(`wrote docs/${shot.name}.png`)
}
