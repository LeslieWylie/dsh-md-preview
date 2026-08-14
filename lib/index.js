// dsh-md-preview — HOST half.
//
// Exposes a private RPC channel the Web client half calls. Everything the
// client can reach goes through the harness `fs` service, so the plugin
// inherits whatever sandbox policy the session already runs under instead of
// opening a second, unpoliced path to disk.
//
//   /dsh-md-preview  ls       { path? }                  -> { ok, path, items }
//                    up       { path }                   -> { ok, path, items }
//                    readFile { path }                   -> { ok, content }
//                    export   { dir, name, content }     -> { ok, path }

export const name = 'dsh-md-preview'

export const inject = ['connection', 'fs']

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

export function apply(ctx) {
  const fs = ctx.fs
  if (fs === undefined) {
    ctx.logger?.warn('dsh-md-preview: no fs service; the preview drawer will stay inert')
    return
  }

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

        case 'export': {
          const path = joinPath(args.dir, args.name)
          const target = await fs.resolve(path)
          await fs.writeText(target, String(args.content ?? ''), undefined, signal)
          return { ok: true, path }
        }

        default:
          return { ok: false, error: `Unknown endpoint: ${endpoint}` }
      }
    } catch (error) {
      return { ok: false, error: errorText(error) }
    }
  })
}
