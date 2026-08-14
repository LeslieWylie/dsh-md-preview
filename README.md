# 📄 dsh-md-preview

**English** | [简体中文](./README.zh-CN.md)

> **Read, edit, and export Markdown without leaving your session.**

A preview drawer for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI. Press **MD** in the session header, browse the working directory, click a `.md` file — it renders in place. No new tab, no second editor, no context switch.

---

## Install

Nothing here is on npm yet, so install straight from GitHub. Add it to your profile's `package.json`:

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dependencies": {
    "dsh-md-preview": "github:LeslieWylie/dsh-md-preview"
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

Pin a tag instead of tracking the default branch with `github:LeslieWylie/dsh-md-preview#v0.1.0`.

<details>
<summary>Try it without editing your profile</summary>

```sh
dsh --profile web --patch <(printf -- "- insert:\n    - id: md-preview\n      name: dsh-md-preview\n")
```

The package still has to be resolvable from the profile's `node_modules`, so run the `pnpm install` above first.
</details>

---

## What it does

| | |
|---|---|
| **Browse in place** | The drawer opens on your working directory. Click a folder to descend, **↑** to go back. No system file dialog. |
| **Render on click** | Headings, bold/italic/strikethrough, inline code, fenced code blocks, blockquotes, ordered/unordered lists, task lists, tables, links, images, rules. |
| **Edit** | Toggle to a plain textarea to scratch notes or fix a line, then toggle back. |
| **Export** | Writes a **standalone** styled HTML page next to the source — self-contained, dark-mode aware, opens anywhere. |
| **Theme-aware** | Reads the harness theme variables, so it matches light and dark without configuration. |

## Why another Markdown plugin

Three things this one does not do:

- **No runtime dependencies.** The client half loads as a plain script with no bundler, so `marked` and `markdown-it` are not available to it. The renderer is ~150 lines of hand-written JavaScript. The dependency tree you audit is this one file.
- **No second path to your disk.** Every read and write goes through the harness `fs` service, so the plugin inherits whatever sandbox policy the session already runs under. It does not open its own filesystem access. `readFile` refuses anything that is not `.md`, `.markdown`, `.mdx`, or `.txt`.
- **No raw HTML execution.** Every scrap of document text is HTML-escaped before any inline syntax runs, and link targets that are not `http(s):`, `#`, `/`, or `mailto:` collapse to `#`. A document containing `<script>` or a `javascript:` link renders as literal characters.

## How it works

Two halves, talking over one private RPC channel:

```
Web client half                      Host half
 slots.inject(header, overlay)  ──▶   ctx.connection.rpc.handle("/dsh-md-preview")
 renders Markdown in-browser          ls · up · readFile · export ──▶ ctx.fs
```

The host half never renders; the client half never touches disk.

## Compatibility

Needs a harness with the web GUI (`ctx.slots`, `ctx.connection`) and a host `ctx.fs` service. If `fs` is missing the plugin logs a warning and stays inert rather than half-loading.

## License

MIT
