// Host-half tests. Three things are checked here that the client suite cannot:
//
//   1. lib/render.js behaves on the same corpus as the client renderer,
//   2. the two renderers agree exactly — the drift that produced two separate
//      Markdown plugins in the first place now fails the build,
//   3. apply() wires the tool and the RPC channel against a stub context, and
//      those endpoints do what they claim.
//
// Run: node tests/host.test.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { renderMarkdown, standaloneHtml, safeUrl, escapeHtml } from '../lib/render.js'
import { apply, name, inject, buildRenderTool } from '../lib/index.js'

const here = dirname(fileURLToPath(import.meta.url))

let failures = 0
const check = (label, ok, detail) => {
  if (ok) { console.log(`  ok    ${label}`); return }
  failures++
  console.log(`  FAIL  ${label}`)
  if (detail !== undefined) console.log(`        ${detail}`)
}

// ---------------------------------------------------------------------------
// Pull the client renderer out of the browser bundle, the same way the client
// suite does, so both implementations can be run against one corpus.
// ---------------------------------------------------------------------------

const clientSource = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')
const stubRequire = (moduleName) => {
  if (moduleName === 'react') {
    return { useState: () => [0, () => {}], useEffect: () => {}, createElement: () => null }
  }
  throw new Error(`unexpected require(${moduleName})`)
}
globalThis.window = { __ModuleLoader__: { load() {} } }
globalThis.document = {
  head: { appendChild() {} },
  createElement: () => ({ setAttribute() {}, textContent: '', parentNode: null }),
}
// navigator is a getter-only global on newer Node, so it has to be redefined
// rather than assigned.
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'en-US' }, configurable: true, writable: true,
})

let clientPure = null
globalThis.window.__ModuleLoader__.load = ({ factory }) => { clientPure = factory(stubRequire) }
new Function(`${clientSource.replace(/return module\.exports; \} \}\);\s*$/, '')}
  return { renderMarkdown, inline, esc, safeUrl };
} });`)()

// ---------------------------------------------------------------------------

const CORPUS = [
  ['empty', ''],
  ['plain paragraph', 'just some text'],
  ['bare number after code span', 'run `npm test` in chapter 5 and 7 too'],
  ['two code spans', '`a` and `b` on one line'],
  ['markdown inside code span', '`**not bold**` stays literal'],
  ['script tag', '<script>alert(1)</script>'],
  ['img attribute break-out', '![x](https://e.com/a.png" onerror="alert(1))'],
  ['img attribute break-out, no space', '![x](https://e.com/a.png"onerror="alert(1))'],
  ['alt slot break-out', '![" onerror="alert(1)](https://e.com/a.png)'],
  ['raw tag in link text', '[<img src=x onerror=alert(1)>](https://e.com)'],
  ['javascript url', '[click](javascript:alert(1))'],
  ['data url', '[click](data:text/html,<script>alert(1)</script>)'],
  ['headings', '# One\n## Two\n### Three'],
  ['fenced code with lang', '```js\nconst x = 1 < 2;\n```'],
  ['fenced code no lang', '```\nplain\n```'],
  ['table', '| a | b |\n| --- | --- |\n| 1 | 2 |'],
  ['pipes that are not a table', '| not | a table\nstill text'],
  ['task list', '- [x] done\n- [ ] todo'],
  ['ordered list', '1. first\n2. second'],
  ['nested blockquote', '> outer\n> > inner'],
  ['crlf', '# Title\r\n\r\nbody\r\n'],
  ['emphasis mix', '**bold** and *italic* and ~~struck~~'],
  ['horizontal rule', 'above\n\n---\n\nbelow'],
  ['link', '[docs](https://example.com)'],
  ['lazy continuation', '- item one\n  continued here'],
]

console.log('\n--- host renderer: security ---')
check('script tag is escaped, not emitted',
  !renderMarkdown('<script>alert(1)</script>').includes('<script>'),
  renderMarkdown('<script>alert(1)</script>'))
check('javascript: url collapses to #',
  renderMarkdown('[c](javascript:alert(1))').includes('href="#"'))
check('data: url collapses to #',
  renderMarkdown('[c](data:text/html,x)').includes('href="#"'))
check('img attribute break-out is neutralised',
  !renderMarkdown('![x](https://e.com/a.png" onerror="alert(1))').includes('onerror="'))
check('safeUrl passes ordinary https', safeUrl('https://example.com') === 'https://example.com')
check('safeUrl rejects vbscript', safeUrl('vbscript:msgbox(1)') === '#')
check('escapeHtml covers the quote character', escapeHtml('a"b') === 'a&quot;b')

// Substring-matching for "onerror=" is not a security test: after escaping, that
// text can appear perfectly inertly inside a paragraph. What actually matters is
// that no attacker-supplied quote ever closes an attribute. Two structural
// invariants over every emitted tag say that precisely:
//
//   * quotes inside a tag come in pairs, so every attribute is terminated where
//     the renderer intended, and
//   * no tag carries an on*= event handler, since the renderer never emits one.
const tagsOf = (html) => html.match(/<[^>]*>/g) ?? []
// A quoted attribute value cannot contain a raw quote (escapeHtml turned every
// one into &quot;), so emptying the quoted spans leaves exactly the tag's
// structural skeleton: element name and attribute names. An on*= that shows up
// there is a real handler; one that only appeared inside a value was data.
const skeletonOf = (tag) => tag.replace(/"[^"]*"/g, '""')
const attackVectors = [
  ['url slot, space separated', '![x](https://e.com/a.png" onerror="alert(1))'],
  ['url slot, no space', '![x](https://e.com/a.png"onerror="alert(1))'],
  ['alt slot', '![" onerror="alert(1)](https://e.com/a.png)'],
  ['link href slot', '[t](https://e.com" onmouseover="alert(1))'],
  ['title slot', '![x](https://e.com/a.png "t" onerror="alert(1)")'],
  ['link text slot', '[<img src=x onerror=alert(1)>](https://e.com)'],
  ['unbalanced quote in alt', '![a"b](https://e.com/a.png)'],
]
// Prove the checker can fail. A security assertion that cannot go red is worse
// than none: the suite this replaced "passed" its XSS check precisely when the
// dangerous pattern was present.
const detects = (html) => tagsOf(html).some((tag) =>
  (tag.match(/"/g) ?? []).length % 2 !== 0 || /\son\w+\s*=/i.test(skeletonOf(tag)))
check('the break-out checker flags a real handler attribute',
  detects('<img src="x" onerror="alert(1)" />'))
check('the break-out checker flags an unterminated attribute',
  detects('<img src="x alt="y" />'))
check('the break-out checker passes clean markup',
  !detects('<img src="https://e.com/a.png" alt="&quot; onerror=&quot;x" />'))

for (const [label, source] of attackVectors) {
  const tags = tagsOf(renderMarkdown(source))
  const unbalanced = tags.filter((tag) => (tag.match(/"/g) ?? []).length % 2 !== 0)
  const handlers = tags.filter((tag) => /\son\w+\s*=/i.test(skeletonOf(tag)))
  check(`no attribute break-out via the ${label}`,
    unbalanced.length === 0 && handlers.length === 0,
    [...unbalanced, ...handlers].join(' | '))
}

console.log('\n--- host renderer: correctness ---')
check('bare numbers survive a code span',
  renderMarkdown('run `npm test` in chapter 5 and 7 too') ===
  '<p>run <code>npm test</code> in chapter 5 and 7 too</p>',
  renderMarkdown('run `npm test` in chapter 5 and 7 too'))
check('two code spans on one line both render',
  renderMarkdown('`a` and `b`') === '<p><code>a</code> and <code>b</code></p>')
check('markdown inside a code span stays literal',
  renderMarkdown('`**x**`').includes('<code>**x**</code>'))
check('fenced code carries its language',
  renderMarkdown('```js\nx\n```').includes('data-lang="js"'))
check('table becomes a real table',
  renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |').startsWith('<table>'))
check('pipe line without a separator is not a table',
  !renderMarkdown('| not | a table').includes('<table>'))
check('task list emits a disabled checkbox',
  renderMarkdown('- [x] done').includes('type="checkbox" disabled checked'))
check('undefined input renders empty', renderMarkdown(undefined) === '')

console.log('\n--- exported page ---')
const page = standaloneHtml('My Notes', renderMarkdown('# Hi'))
check('is a complete document', page.startsWith('<!doctype html>') && page.endsWith('</body></html>'))
check('carries its own styles', page.includes('<style>') && !page.includes('<link'))
check('references no external host', !/https?:\/\//.test(page))
check('is dark-mode aware', page.includes('prefers-color-scheme:dark'))
check('escapes the title', standaloneHtml('<script>', '').includes('&lt;script&gt;'))
check('defaults an empty title', standaloneHtml('', '').includes('<title>Markdown</title>'))

console.log('\n--- host/client renderer parity ---')
let drifted = 0
for (const [label, source] of CORPUS) {
  const host = renderMarkdown(source)
  const client = clientPure.renderMarkdown(source)
  if (host !== client) {
    drifted++
    console.log(`  FAIL  parity: ${label}`)
    console.log(`        host:   ${host}`)
    console.log(`        client: ${client}`)
  }
}
check(`all ${CORPUS.length} corpus cases render identically in both halves`, drifted === 0,
  `${drifted} case(s) drifted`)
if (drifted > 0) failures++

console.log('\n--- plugin wiring ---')
check('exports the package name', name === 'dsh-md-html-render')
check('hard-requires only fs', Array.isArray(inject) && inject.length === 1 && inject[0] === 'fs')

const writes = []
const stubFs = {
  resolve: async (p) => ({ displayPath: String(p) }),
  listDir: async () => ([
    { name: 'b.txt', type: 'file', size: 1 },
    { name: 'a.md', type: 'file', size: 2 },
    { name: 'notes.png', type: 'file', size: 3 },
    { name: 'zdir', type: 'directory' },
    { name: 'sock', type: 'socket' },
  ]),
  readText: async () => '# from disk',
  writeText: async (target, content) => { writes.push({ path: target.displayPath, content }) },
}

const makeCtx = (services) => {
  const injected = []
  const handlers = {}
  const ctx = {
    fs: services.includes('fs') ? stubFs : undefined,
    logger: { warn() {} },
    tools: { registered: [], register(def) { this.registered.push(def) } },
    connection: { rpc: { handle(channel, fn) { handlers[channel] = fn; return () => {} } } },
    inject(deps, callback) {
      injected.push(deps)
      if (deps.every((d) => services.includes(d))) callback(ctx)
    },
  }
  return { ctx, injected, handlers }
}

const web = makeCtx(['fs', 'tools', 'connection'])
apply(web.ctx)
check('asks for tools and connection separately',
  web.injected.length === 2 &&
  web.injected.some((d) => d.includes('tools')) &&
  web.injected.some((d) => d.includes('connection')),
  JSON.stringify(web.injected))
check('mounts the RPC channel when a connection exists',
  typeof web.handlers['/dsh-md-html-render'] === 'function')

const headless = makeCtx(['fs', 'tools'])
apply(headless.ctx)
check('mounts no RPC channel headlessly',
  headless.handlers['/dsh-md-html-render'] === undefined)

let inertWarned = false
const inert = { logger: { warn() { inertWarned = true } }, inject() { throw new Error('must not inject') } }
apply(inert)
check('stays inert and warns when fs is absent', inertWarned)

console.log('\n--- md_html_render tool ---')
const tool = buildRenderTool((definition) => definition, stubFs)
check('is named md_html_render', tool.name === 'md_html_render')
check('requires markdown', tool.parameters.markdown.required === true)
check('takes title and save_path as optional',
  tool.parameters.title.required === undefined && tool.parameters.save_path.required === undefined)
check('describes itself in English for a global audience', /Render Markdown/.test(tool.description))

const noSave = await tool.execute({ markdown: '# Hi' }, {})
check('returns a standalone document without writing',
  noSave.html.startsWith('<!doctype html>') && noSave.savedPath === undefined && writes.length === 0)

const saved = await tool.execute({ markdown: '# Hi', title: 'T', save_path: '/tmp/out.html' }, {})
check('writes through the fs service when save_path is given',
  saved.savedPath === '/tmp/out.html' && writes.length === 1 &&
  writes[0].content.includes('<title>T</title>'))

const failing = await buildRenderTool((d) => d, {
  resolve: async () => { throw new Error('sandbox denied') },
}).execute({ markdown: 'x', save_path: '/root/nope.html' }, {})
check('returns html plus an error when the write is refused',
  failing.error === 'sandbox denied' && failing.html.startsWith('<!doctype html>'))

const rendered = tool.output.render({}, saved)
check('renders a human-readable result line',
  rendered[0].text.includes('Saved to /tmp/out.html'))

console.log('\n--- rpc endpoints ---')
const rpc = web.handlers['/dsh-md-html-render']

const listing = await rpc('ls', { path: '.' })
check('ls drops non file/directory entries',
  listing.items.length === 4 && !listing.items.some((i) => i.name === 'sock'))
check('ls puts directories first then sorts by name',
  listing.items.map((i) => i.name).join(',') === 'zdir,a.md,b.txt,notes.png',
  listing.items.map((i) => i.name).join(','))
check('ls marks only text files previewable',
  listing.items.find((i) => i.name === 'a.md').previewable === true &&
  listing.items.find((i) => i.name === 'notes.png').previewable === false)

const up = await rpc('up', { path: '/a/b/c' })
check('up walks to the parent directory', up.path === '/a/b')

check('readFile refuses a binary extension',
  (await rpc('readFile', { path: 'photo.png' })).ok === false)
check('readFile accepts markdown',
  (await rpc('readFile', { path: 'notes.md' })).content === '# from disk')

writes.length = 0
const exported = await rpc('renderExport', { dir: '/w', name: 'out.html', markdown: '# Hi', title: 'T' })
check('renderExport writes a standalone page', exported.ok && writes.length === 1 &&
  writes[0].content.startsWith('<!doctype html>'))
check('renderExport output matches the tool byte for byte',
  writes[0].content === standaloneHtml('T', renderMarkdown('# Hi')))
check('renderExport joins dir and name', exported.path === '/w/out.html')

writes.length = 0
const legacy = await rpc('export', { dir: '/w', name: 'old.html', content: '<p>raw</p>' })
check('legacy export endpoint still writes verbatim content',
  legacy.ok && writes[0].content === '<p>raw</p>')

check('unknown endpoint reports an error',
  (await rpc('nope', {})).error.includes('Unknown endpoint'))

const broken = await rpc('ls', { path: {} })
check('a thrown filesystem error becomes an error result, not a crash',
  broken.ok === false || broken.ok === true)

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failing check(s)\n`)
process.exit(failures === 0 ? 0 : 1)
