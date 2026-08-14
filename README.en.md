# dsh-md-preview

**Markdown side-drawer preview for the DeepSeek Harness web GUI.**

Click the **MD** button in the session header to open a right-side drawer: browse the
current working directory, click a `.md` file, and get an instant GitHub-styled
preview. Switch to edit mode for live source editing, or export the rendered
document as standalone HTML.

## Features

- Session-header **MD** button toggles the right-side drawer
- **Built-in directory navigation** — opens on the current working directory;
  click a folder to enter, `⬆` to go back. No system directory picker needed.
- Click / double-click a `.md` file to render it immediately
- **Preview / Edit** toggle with live re-render while editing
- GitHub-style rendering: headings, bold/italic/strikethrough, inline code,
  fenced code blocks, blockquotes, ordered/unordered lists,
  **task lists**, **tables**, links, images, horizontal rules
- **Export** renders the current document as standalone styled HTML into the
  current directory
- Status bar: line count, active file, notices / errors
- Theme-aware via DSH `--dsw-alias-*` CSS variables (light & dark)

## Files

| File | Role |
|---|---|
| `host.js` | Host half: `md/ls`, `md/up`, `md/readFile`, `md/export` package-private RPC over the `fs` service |
| `client.js` | Client half: hand-written lightweight Markdown parser + drawer UI + theme-aware CSS |

## Install / Deploy

This plugin is authored as a **dynamic Cordis plugin** snapshot (both Host and
Client halves). It is intended for deployment through the DSH plugin workflow:
`cordis_define` (paste `host.js` as `code.host`, `client.js` as `code.client`)
then `cordis_run` (first run requires UI approval for the Client half).
Dynamic plugins live per-process; redeploy from these files after a restart.

For a static, npm-distributable bundle form (Host-only), see the companion
`dsh-md-html-render` tool style: `package.json` declaring `dsh.bundle.patch`
plus `cordis.patch.yml`, installed via `dsh plugin --profile <name> add <pkg>`.

## Design notes

- Split-pane live preview inspired by StackEdit / HackMD layouts
- GitHub-style typography and table borders
- Responsive tables and code block presentation inspired by Codex CLI's render
  pipeline
- Client sandbox has no `import`/bundler, so the parser is hand-written pure JS:
  all user text is HTML-escaped before inline processing; preview never
  executes raw scripts

## License

MIT