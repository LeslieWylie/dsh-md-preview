// dsh-md-html-render — CLIENT half unit tests.
//
// client.js is wrapped in the web module-loader preamble and ends with
// `return module.exports; } });`, so it cannot simply be imported here. Rather
// than shim the whole loader, React, and the DOM for one pure helper, these
// tests slice the helper out of the source and evaluate it. The upside over
// asserting on a regex is that the real function body runs; the downside is
// that renaming the helper breaks the test loudly, which is the intent.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SOURCE = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')

function extract(name, endMarker) {
  const start = SOURCE.indexOf(`var ${name} =`)
  assert.notEqual(start, -1, `client.js no longer declares ${name}`)
  const end = SOURCE.indexOf(endMarker, start)
  assert.notEqual(end, -1, `could not find the end of ${name}`)
  return SOURCE.slice(start, end + endMarker.length)
}

const displayPath = Function(
  `"use strict"; ${extract('LRM', 'return path ? LRM + path : "…";\n};')} return displayPath;`,
)()

const LRM = '‎'

test('a path is prefixed with U+200E so the leading "~/" is not reordered', () => {
  // `.mdp-cwdp` is direction:rtl so a long path ellipsizes from the front and
  // keeps the deepest directory visible. Without the mark, that base direction
  // pushes the leading run of bidi-neutral characters — "~/" — to the far end,
  // and `~/projects/app` displayed as `projects/app/~`.
  const shown = displayPath('~/projects/app')
  assert.equal(shown, `${LRM}~/projects/app`)
  assert.ok(shown.startsWith(LRM), 'the mark must lead, a trailing one does nothing')
  assert.equal(shown.slice(1), '~/projects/app', 'the path itself must be untouched')
})

test('an absolute path is passed through with the same guard', () => {
  assert.equal(displayPath('/var/tmp/notes'), `${LRM}/var/tmp/notes`)
})

test('an empty cwd falls back to the placeholder rather than a bare mark', () => {
  // A lone U+200E would render as an invisible, unexplained blank strip.
  assert.equal(displayPath(''), '…')
  assert.equal(displayPath(undefined), '…')
})

test('the drawer actually renders the cwd through displayPath', () => {
  // Guards against the helper being correct but orphaned.
  assert.match(
    SOURCE,
    /className:\s*"mdp-cwdp"\s*\}\s*,\s*displayPath\(s\.cwd\)\)/,
    'the .mdp-cwdp span must render displayPath(s.cwd), not the raw path',
  )
})

test('the style that makes the mark necessary is still present', () => {
  // If someone drops direction:rtl the mark becomes dead weight and this test
  // should say so instead of silently passing forever.
  assert.match(SOURCE, /\.mdp-cwd \.mdp-cwdp\{[^"]*direction:rtl/)
})
