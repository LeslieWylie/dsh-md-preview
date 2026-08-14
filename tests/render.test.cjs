// Test harness: loads the client half by stubbing the module loader + react,
// then exercises the Markdown renderer through the same code path the browser uses.
const fs = require('node:fs')
const path = require('node:path')

const clientPath = path.join(__dirname, '..', 'lib', 'client.js')
const source = fs.readFileSync(clientPath, 'utf8')

let captured = null
global.window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      captured = { id, exports: factory(stubRequire) }
    },
  },
}
global.document = {
  head: { appendChild() {} },
  createElement: () => ({ setAttribute() {}, textContent: '', parentNode: null }),
}
global.navigator = { language: 'en-US' }

function stubRequire(name) {
  if (name === 'react') return { useState: () => [0, () => {}], useEffect: () => {}, createElement: () => null }
  throw new Error(`unexpected require(${name})`)
}

// Evaluate the file exactly as the loader would.
new Function(source)()

if (!captured) {
  console.error('FAIL: module never registered with __ModuleLoader__')
  process.exit(1)
}

// Reach the renderer: it is module-private, so re-evaluate the source with a
// tail export to pull the two pure functions out for testing.
const probe = new Function(`${source.replace(/return module\.exports; \} \}\);\s*$/, '')}
  return { renderMarkdown, inline, esc, safeUrl };
} });`)
let pure = null
global.window.__ModuleLoader__.load = ({ factory }) => { pure = factory(stubRequire) }
probe()

const { renderMarkdown } = pure

let failures = 0
const check = (label, actual, predicate, expectation) => {
  const ok = predicate(actual)
  if (!ok) {
    failures++
    console.log(`  FAIL  ${label}`)
    console.log(`        expected: ${expectation}`)
    console.log(`        actual:   ${actual}`)
  } else {
    console.log(`  ok    ${label}`)
  }
}

console.log('\n--- security ---')
check('script tag is escaped, not executed',
  renderMarkdown('<script>alert(1)</script>'),
  (h) => !h.includes('<script>') && h.includes('&lt;script&gt;'),
  'literal &lt;script&gt;, no live tag')

check('javascript: link collapses to #',
  renderMarkdown('[click](javascript:alert(1))'),
  (h) => !h.toLowerCase().includes('javascript:') && h.includes('href="#"'),
  'href="#"')

check('data: image URL collapses to #',
  renderMarkdown('![x](data:text/html,<script>alert(1)</script>)'),
  (h) => !h.includes('data:'),
  'no data: URI')

check('img onerror payload cannot break out of the attribute',
  renderMarkdown('![" onerror="alert(1)](https://e.com/a.png)'),
  (h) => !h.includes('onerror="alert'),
  'no live onerror handler')

console.log('\n--- the NUL-sentinel regression I was hunting ---')
check('bare numbers around code spans survive intact',
  renderMarkdown('see `code` in chapter 5 and 7 of the book'),
  (h) => h.includes('<code>code</code>') && h.includes('chapter 5 and 7') && !h.includes('undefined'),
  'code span rendered AND "chapter 5 and 7" untouched')

check('two code spans in one line both resolve',
  renderMarkdown('`a` then `b`'),
  (h) => h.includes('<code>a</code>') && h.includes('<code>b</code>') && !h.includes('undefined'),
  'both spans')

check('code span containing markdown is not re-parsed',
  renderMarkdown('`**not bold**`'),
  (h) => h.includes('<code>**not bold**</code>') && !h.includes('<strong>'),
  'literal asterisks inside code')

console.log('\n--- block syntax ---')
check('heading', renderMarkdown('# Title'), (h) => h === '<h1>Title</h1>', '<h1>Title</h1>')
check('fenced code keeps language', renderMarkdown('```js\nconst a = 1\n```'),
  (h) => h.includes('data-lang="js"') && h.includes('const a = 1'), 'lang attr + body')
check('table renders as table', renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |'),
  (h) => h.includes('<table>') && h.includes('<th>a</th>') && h.includes('<td>1</td>'), 'thead + tbody')
check('pipe text that is NOT a table stays paragraph',
  renderMarkdown('| just a pipe line'),
  (h) => h.startsWith('<p>') && !h.includes('<table>'), 'paragraph, no table')
check('task list checked state', renderMarkdown('- [x] done\n- [ ] todo'),
  (h) => h.includes('checked') && h.includes('<input type="checkbox"'), 'checkbox inputs')
check('blockquote nests block content', renderMarkdown('> # quoted heading'),
  (h) => h.includes('<blockquote>') && h.includes('<h1>quoted heading</h1>'), 'heading inside quote')
check('CRLF input does not leave stray characters', renderMarkdown('# A\r\n\r\ntext'),
  (h) => !h.includes('\r'), 'no carriage returns')
check('empty input is safe', renderMarkdown(''), (h) => h === '', 'empty string')
check('undefined input is safe', renderMarkdown(undefined), (h) => h === '', 'empty string')

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`)
process.exit(failures === 0 ? 0 : 1)
