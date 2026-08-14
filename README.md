# 📄 dsh-md-preview

**English** | [简体中文](./README.zh-CN.md)

> **Turn Markdown into a page you can send to someone.**

A Markdown renderer for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with two front doors and one engine behind them:

- **`md_html_render`** — a tool the model can call. Give it Markdown, get back a complete, self-contained HTML document, optionally written to disk. Works in a headless profile with no GUI at all.
- **The MD drawer** — press **MD** in the web session header, browse your working directory, click a `.md` file. It renders in place. No new tab, no second editor, no context switch.

Both go through the same renderer, so a page the model generates and a page you export from the drawer are byte-for-byte identical. A test asserts that on every case in the corpus.

---

## Install

Not on npm yet — install straight from GitHub. Add it to your profile's `package.json`:

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dependencies": {
    "dsh-md-preview": "github:LeslieWylie/dsh-md-preview#v0.2.0"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-md-preview"]
    }
  }
}
```

Then reinstall and restart the profile:

```sh
cd ~/.dsh/profiles/<profile> && pnpm install
dsh --profile <profile>
```

Drop the `#v0.2.0` to track the default branch instead of pinning.

<details>
<summary>Try it without editing your profile</summary>

```sh
dsh --profile web --patch <(printf -- "- insert:\n    - id: md-preview\n      name: dsh-md-preview\n")
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

Two executing suites, no mocks of the thing under test:

- **`tests/render.test.cjs`** extracts the client renderer from the browser bundle and runs it.
- **`tests/host.test.mjs`** runs the host renderer on the same corpus, **asserts the two agree exactly** (a drift between them is what produced two competing Markdown plugins in this account before they were merged), then drives `apply()` against a stub context to check the tool shape, the RPC endpoints, and the sandbox-refusal path.

The XSS checks assert a structural invariant — no emitted tag ever carries an unterminated attribute or an `on*=` handler — and the suite includes checks that the checker itself goes red on genuinely unsafe markup, so a security assertion cannot silently rot into one that always passes.

## License

MIT
