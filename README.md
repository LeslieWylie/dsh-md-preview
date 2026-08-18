# 📄 dsh-md-html-render

**English** | [简体中文](./README.zh-CN.md)

> **Turn Markdown into a page you can send to someone.**

A Markdown renderer for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with two front doors and one engine behind them:

- **`md_html_render`** — a tool the model can call. Give it Markdown, get back a complete, self-contained HTML document, optionally written to disk. Works in a headless profile with no GUI at all.
- **The MD drawer** — press **MD** in the web session header, browse your working directory, click a `.md` file. It renders in place. No new tab, no second editor, no context switch.

Both go through the same renderer, so a page the model generates and a page you export from the drawer are byte-for-byte identical. A test asserts that on every case in the corpus.

![The MD drawer open over a session, rendering a README in place](https://raw.githubusercontent.com/LeslieWylie/dsh-md-preview/main/docs/drawer.png)

---

## Install

> **Renamed in v0.3.0.** This package was `dsh-md-preview` through v0.2.2. The
> npm name `dsh-md-preview` was registered by an unrelated project from another
> author on 2026-08-17, so this one publishes as **`dsh-md-html-render`** — the
> name of the tool it has always shipped. Installing `dsh-md-preview` from npm
> gets you that other project, not this one. The GitHub repository path is
> unchanged, so existing git pins keep resolving; bump the pin to `#v0.3.0`,
> because the dependency key has to match this package's new name.

Not on npm yet — install straight from GitHub. Add it to your profile's `package.json`:

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dependencies": {
    "dsh-md-html-render": "github:LeslieWylie/dsh-md-preview#v0.3.0"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-md-html-render"]
    }
  }
}
```

Then reinstall and restart the profile:

```sh
cd ~/.dsh/profiles/<profile> && pnpm install
dsh --profile <profile>
```

Drop the `#v0.3.0` to track the default branch instead of pinning.

<details>
<summary>Try it without editing your profile</summary>

```sh
dsh --profile web --patch <(printf -- "- insert:\n    - id: md-preview\n      name: dsh-md-html-render\n")
```

The package still has to resolve from the profile's `node_modules`, so run the `pnpm install` above first.
</details>

---

## The tool

```
md_html_render(markdown, title?, save_path?) -> { html, savedPath?, error? }
```

| Parameter | | |
|---|---|---|
| `markdown` | required | The Markdown source. |
| `title` | optional | Page `<title>`. Defaults to `Markdown`. |
| `save_path` | optional | Where to write the file. Resolved through the session filesystem service, so it obeys the same sandbox policy as every other write. |

Ask for a report, a plan, a comparison table — anything the model would otherwise dump into the transcript — and get a file you can open in a browser or mail to a colleague.

> Render this migration plan to `~/Desktop/plan.html`

The output is **standalone**: styles are embedded, there is no stylesheet, font, script, or image loaded from anywhere. It opens from disk, from a USB stick, or on an airgapped machine and looks the same. It follows the reader's dark mode. Nothing phones home, because there is nothing to phone home to.

![An exported page opened straight from disk — one file, no network](https://raw.githubusercontent.com/LeslieWylie/dsh-md-preview/main/docs/export.png)

If `save_path` is refused by the sandbox, the tool still returns the HTML along with the error, so the work is never lost to a permissions problem.

## The drawer

| | |
|---|---|
| **Browse in place** | Opens on your working directory. Click a folder to descend, **↑** to go back. No system file dialog. |
| **Render on click** | Headings, bold/italic/strikethrough, inline code, fenced code, blockquotes, ordered/unordered/task lists, tables, links, images, rules. |
| **Edit** | Toggle to a plain textarea to scratch a note or fix a line, then toggle back. |
| **Export** | Writes a standalone HTML page next to the source — the same document `md_html_render` produces. |
| **Theme-aware** | Reads the harness theme variables, so it matches light and dark without configuration. |

## Why another Markdown plugin

Three things this one does not do:

- **No runtime dependencies.** The client half loads as a plain script with no bundler, so `marked` and `markdown-it` are not available to it. The renderer is ~150 lines of hand-written JavaScript. The dependency tree you audit is one file.
- **No second path to your disk.** Every read and write goes through the harness `fs` service, so the plugin inherits whatever sandbox policy the session already runs under. It never opens its own filesystem access. The drawer's `readFile` refuses anything that is not `.md`, `.markdown`, `.mdx`, or `.txt`.
- **No raw HTML execution.** Every scrap of document text is HTML-escaped before any inline syntax runs, and link targets that are not `http(s):`, `#`, `/`, or `mailto:` collapse to `#`. A document containing `<script>` or a `javascript:` link renders as literal characters.

## How it works

```
                        lib/render.js          ← the only renderer
                       ╱             ╲
   md_html_render  ◀──╯               ╰──▶  Export button
   (host, headless)                          (client, in-browser)
          │                                        │
          ╰──────────▶  ctx.fs  ◀──────────────────╯
                   every read and write
```

Only `fs` is a hard requirement. The tool registry and the client connection are picked up opportunistically through `ctx.inject`, so the plugin runs headless, in the GUI, or in both, and degrades to whichever surface the profile actually has instead of failing to load.

## Compatibility

| Profile | What you get |
|---|---|
| Headless / CLI | `md_html_render` |
| Web GUI | `md_html_render` **and** the MD drawer |
| No `fs` service | Logs a warning and stays inert rather than half-loading |

Requires Node `^22.19.0 || >=24.0.0`.

## Tests

```sh
npm test
```

Four executing suites, no mocks of the thing under test:

- **`tests/render.test.cjs`** extracts the client renderer from the browser bundle and runs it.
- **`tests/host.test.mjs`** runs the host renderer on the same corpus, **asserts the two agree exactly** (a drift between them is what produced two competing Markdown plugins before they were merged), then drives `apply()` against a stub context to check the tool shape, the RPC endpoints, and the sandbox-refusal path.
- **`tests/client.test.mjs`** covers the drawer's path rendering, including the bidi guard described below.
- **`tests/boot.test.mjs`** boots a real harness `Context` with the harness's own filesystem service, loads this package the way a profile does, then asks the **real** tool registry for `md_html_render` and executes it against the real disk.

That last one exists because a DSH plugin can import cleanly, pass every unit test, and still register nothing when a `Context` actually boots it — silently, with no error. Unit tests cannot see that.

It needs the harness packages, so it is written to skip rather than fail when they are missing. That makes the skip path dangerous: a green tick proves nothing if the integration half never ran. The harness packages are therefore ordinary **`devDependencies`**, not optional peers — npm does not auto-install optional peers, so declaring them that way is exactly what leaves this suite permanently skipped in CI. A plain `npm install && npm test` from a fresh clone runs it for real. If the log says `SKIPPED`, treat the run as unverified.

The XSS checks assert a structural invariant — no emitted tag ever carries an unterminated attribute or an `on*=` handler — and the suite includes checks that the checker itself goes red on genuinely unsafe markup, so a security assertion cannot silently rot into one that always passes.

## Notes

**The `~/` in the path bar.** The breadcrumb is `direction: rtl` so that when a path outgrows the bar, `text-overflow: ellipsis` trims it from the *front* and keeps the deepest directory — the part you are actually looking at — visible. The side effect is that a leading run of bidi-neutral characters, which is precisely what `~/` is, gets reordered to the far end: `~/projects/app` displayed as `projects/app/~`. The fix is a single leading U+200E (LEFT-TO-RIGHT MARK), which anchors the run without disturbing the front-truncation. `unicode-bidi: plaintext` also fixes the order but flips the ellipsis back to the tail, losing the property the `rtl` was there for; a *trailing* mark does nothing at all. `tests/client.test.mjs` pins this.

**The screenshots are generated, not staged.** `node docs/screenshot.mjs --shoot` rebuilds both images from the real renderer, with the drawer CSS sliced out of `lib/client.js` rather than retyped, so they cannot drift from what the plugin actually draws.

## License

MIT
