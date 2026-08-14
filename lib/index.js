// dsh-md-preview — HOST half.
//
// Two surfaces over one renderer:
//
//   * `md_html_render` — a model-facing tool, registered wherever a tool
//     registry exists. This works in a headless profile with no web GUI.
//   * `/dsh-md-preview` — a private RPC channel the web client half calls,
//     mounted only where a client connection exists.
//
// Neither is a hard requirement. `fs` is: both surfaces read and write through
// the harness filesystem service, so the plugin inherits whatever sandbox
// policy the session already runs under instead of opening a second, unpoliced
// path to disk.
//
//   /dsh-md-preview  ls           { path? }                      -> { ok, path, items }
//                    up           { path }                       -> { ok, path, items }
//                    readFile     { path }                       -> { ok, content }
//                    renderExport { dir, name, markdown, title } -> { ok, path }
//                    export       { dir, name, content }         -> { ok, path }

import { renderMarkdown, standaloneHtml } from './render.js'

export const name = 'dsh-md-preview'

// Only `fs` is required. `tools` and `connection` are consumed opportunistically
// through ctx.inject so the plugin works headless, in the GUI, or in both.
export const inject = ['fs']

const CHANNEL = '/dsh-md-preview'

// Only these extensions are ever opened. Directory listings still show every
// entry so navigation works, but readFile refuses anything else.
const TEXT_EXTENSIONS = ['.md', '.markdown', '.mdx', '.txt']

const errorText = (error) => String(error && error.message ? error.message : error)

const joinPath = (dir, entry) => {
  const base = String(dir)
  return base.endsWith('/') ? base + String(entry) : base + '/' + String(entry)
}

const parentOf = (path) => {
  const trimmed = String(path).replace(/\/+$/, '')
  const cut = trimmed.lastIndexOf('/')
  if (cut > 0) return trimmed.slice(0, cut)
  return trimmed.startsWith('/') ? '/' : '.'
}

const isPreviewable = (name) => {
  const lower = String(name).toLowerCase()
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

const TOOL_DESCRIPTION =
  'Render Markdown into a standalone, styled HTML page. Returns the complete HTML ' +
  'string, and when save_path is given also writes the file and returns its path. ' +
  'The page embeds its own styles and follows the reader\'s dark mode, so it opens ' +
  'anywhere without a server or a stylesheet. Use it to turn a plan, report, or ' +
  'document into something a person can open in a browser.'

/**
 * Build the `md_html_render` tool definition.
 *
 * Takes `defineTool` as an argument rather than importing it, so the shape and
 * the execute path can be tested without the harness tool package present.
 */
export function buildRenderTool(defineTool, fs) {
  return defineTool({
    name: 'md_html_render',
    description: TOOL_DESCRIPTION,
    parameters: {
      markdown: { type: 'string', required: true, description: 'The Markdown source to render.' },
      title: { type: 'string', description: 'Page <title>. Defaults to "Markdown".' },
      save_path: {
        type: 'string',
        description: 'Optional path to write the HTML file to. Resolved through the session filesystem service, so it obeys the same sandbox policy as every other write.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          html: { type: 'string', description: 'The complete HTML document.' },
          savedPath: { type: 'string', description: 'Present when the document was written to disk.' },
          error: { type: 'string', description: 'Present when the write failed; html is still returned.' },
        },
      },
      render(_args, value) {
        const lines = []
        if (value && value.savedPath) lines.push('Saved to ' + value.savedPath)
        if (value && value.html) lines.push(value.html.length + ' characters of HTML')
        if (value && value.error) lines.push('Write failed: ' + value.error)
        return [{ type: 'text', text: lines.join('\n') || 'ok' }]
      },
    },
    async execute(args, runContext) {
      const signal = runContext && runContext.signal ? runContext.signal : undefined
      const html = standaloneHtml(args.title, renderMarkdown(args.markdown))
      if (!args.save_path) return { html }
      try {
        const target = await fs.resolve(String(args.save_path))
        await fs.writeText(target, html, undefined, signal)
        return { html, savedPath: target.displayPath ?? String(args.save_path) }
      } catch (error) {
        return { html, error: errorText(error) }
      }
    },
  })
}

function registerRenderTool(ctx, fs) {
  let disposed = false

  // Imported lazily: if the harness tool helper is unavailable, that disables
  // this one tool rather than taking the preview drawer down with it.
  import('@deepseek-ai/dsh-tools')
    .then(({ defineTool }) => {
      if (disposed) return
      ctx.tools.register(buildRenderTool(defineTool, fs))
    })
    .catch((error) => {
      ctx.logger?.warn('dsh-md-preview: md_html_render unavailable (' + errorText(error) + ')')
    })

  return () => { disposed = true }
}

function mountPreviewChannel(ctx, fs) {
  const listDirectory = async (path, signal) => {
    const target = await fs.resolve(path === undefined || path === '' ? '.' : String(path))
    const entries = await fs.listDir(target, signal)
    const items = entries
      .filter((entry) => entry.type === 'file' || entry.type === 'directory')
      .map((entry) => ({
        name: entry.name,
        type: entry.type,
        size: entry.size,
        previewable: entry.type === 'file' && isPreviewable(entry.name),
      }))
      // Directories first, then alphabetical — stable ordering across backends.
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    return { ok: true, path: target.displayPath, items }
  }

  const write = async (dir, name, content, signal) => {
    const path = joinPath(dir, name)
    const target = await fs.resolve(path)
    await fs.writeText(target, String(content ?? ''), undefined, signal)
    return { ok: true, path }
  }

  return ctx.connection.rpc.handle(CHANNEL, async (endpoint, payload, signal) => {
    const args = payload && typeof payload === 'object' ? payload : {}
    try {
      switch (endpoint) {
        case 'ls':
          return await listDirectory(args.path, signal)

        case 'up':
          return await listDirectory(parentOf(args.path), signal)

        case 'readFile': {
          const path = String(args.path ?? '')
          if (!isPreviewable(path)) {
            return { ok: false, error: 'Only Markdown and plain-text files can be previewed.' }
          }
          const target = await fs.resolve(path)
          return { ok: true, content: await fs.readText(target, signal) }
        }

        // The drawer sends Markdown and the host renders it, so an exported
        // page and a `md_html_render` page come out of the same code path.
        case 'renderExport':
          return await write(
            args.dir,
            args.name,
            standaloneHtml(args.title, renderMarkdown(args.markdown)),
            signal,
          )

        // Retained so an older client half keeps working after a host upgrade.
        case 'export':
          return await write(args.dir, args.name, args.content, signal)

        default:
          return { ok: false, error: `Unknown endpoint: ${endpoint}` }
      }
    } catch (error) {
      return { ok: false, error: errorText(error) }
    }
  })
}

export function apply(ctx) {
  const fs = ctx.fs
  if (fs === undefined) {
    ctx.logger?.warn('dsh-md-preview: no fs service; the plugin will stay inert')
    return
  }

  ctx.inject(['tools'], (toolCtx) => registerRenderTool(toolCtx, fs))
  ctx.inject(['connection'], (connectionCtx) => mountPreviewChannel(connectionCtx, fs))
}
