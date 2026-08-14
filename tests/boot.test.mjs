// Integration test: does this package actually load in a real harness?
//
// The other two suites exercise the renderer and drive apply() against a stub
// context. Neither can catch the failure mode that broke the plugin this one
// replaced: a package that imports cleanly, passes every unit test, and then
// registers nothing at all once a real Context boots it.
//
// This one boots a genuine cordis Context with the harness's own filesystem
// service, loads this package the way a profile would, and then asks the real
// tool registry for the tool and executes it against the real disk.
//
// It needs the harness packages present, which they are inside a profile's
// node_modules but are not in a bare checkout of this repo. When they cannot be
// resolved the suite SKIPS rather than fails, so `npm test` still works from a
// clone. To run it for real:
//
//   cd ~/.dsh/profiles/<profile>/node_modules/dsh-md-preview && node tests/boot.test.mjs
//
// Run: node tests/boot.test.mjs

import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
const check = (label, ok, detail) => {
  if (ok) { console.log(`  ok    ${label}`); return }
  failures++
  console.log(`  FAIL  ${label}`)
  if (detail !== undefined) console.log(`        ${detail}`)
}

// dsh-fs-local subclasses dsh-fs, so the backend alone provides `fs`; loading
// both raises `service "fs" has been registered`.
const REQUIRED = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-fs-local',
]

const harness = {}
for (const specifier of REQUIRED) {
  try {
    harness[specifier] = await import(specifier)
  } catch (error) {
    console.log(`\n--- harness boot: SKIPPED ---`)
    console.log(`  ${specifier} is not resolvable from here (${error.code ?? 'error'}).`)
    console.log(`  Run this suite from inside an installed profile to exercise it.`)
    process.exit(0)
  }
}

console.log('\n--- harness boot ---')

const { Context } = harness['@deepseek-ai/cordis']
const asPlugin = (mod) => mod.default ?? mod

const ctx = new Context()
const warnings = []
ctx.on('internal/warning', (...args) => warnings.push(args.map(String).join(' ')))

await ctx.plugin(asPlugin(harness['@deepseek-ai/dsh-system-prompt']), {})
await ctx.plugin(asPlugin(harness['@deepseek-ai/dsh-tools']))
await ctx.plugin(asPlugin(harness['@deepseek-ai/dsh-fs-local']), {})
await new Promise((resolve) => setTimeout(resolve, 200))

check('the harness provides a real fs service', ctx.fs !== undefined,
  'without it the plugin is designed to stay inert, so the rest would prove nothing')

// Load this package by its own entry point, resolved from disk exactly as the
// profile loader would resolve it.
const self = await import('../lib/index.js')
await ctx.plugin(self, {})
// Registration goes through a lazy import of the tool helper, so it lands a
// tick or two after plugin() resolves.
await new Promise((resolve) => setTimeout(resolve, 1000))

const definition = ctx.tools?.get?.('md_html_render')
check('md_html_render reaches the real tool registry', definition !== undefined,
  warnings.length ? `warnings: ${warnings.join(' | ')}` : 'registry returned nothing and nothing warned')

if (definition === undefined) {
  console.log(`\nFAIL — ${++failures} failing check(s)\n`)
  process.exit(1)
}

check('the registry accepted the parameter schema',
  definition.parameters?.required?.includes('markdown') === true,
  JSON.stringify(definition.parameters))

console.log('\n--- execute against the real filesystem service ---')

const scratch = mkdtempSync(join(tmpdir(), 'dsh-md-preview-boot-'))
const target = join(scratch, 'out.html')
try {
  const result = await definition.execute(
    { markdown: '# Boot\n\nRendered through the **real** registry.\n\n- [x] loaded', title: 'Boot', save_path: target },
    {},
  )
  check('execute reports no error', result.error === undefined, result.error)
  check('execute reports the path it wrote', result.savedPath === target, result.savedPath)
  check('the file is really on disk', existsSync(target))

  const html = existsSync(target) ? readFileSync(target, 'utf8') : ''
  check('what landed is a complete document', html.startsWith('<!doctype html>'))
  check('it carries the requested title', html.includes('<title>Boot</title>'))
  check('it still loads nothing from the network', !/https?:\/\//.test(html))
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failing check(s)\n`)
process.exit(failures === 0 ? 0 : 1)
