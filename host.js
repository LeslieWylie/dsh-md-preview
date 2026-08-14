// ============================================================================
// md-preview plugin — HOST half (v2: drawer preview with built-in directory nav)
// RPC surface for the Client half:
//   md/ls       { path? }  -> { ok, path: displayPath, items: [{name,type,size}] }
//   md/up       { path }   -> { ok, path, items }           (parent directory)
//   md/readFile { path }   -> { ok, content }
//   md/export   { dir, name, content } -> { ok, path }
// Uses the DSH `fs` service. A pluggable backend resolves paths; displayPath is
// the model/UI-facing absolute path. Relative paths resolve against the default
// cwd, so `md/ls {path:''}` lists the current workspace root.
// ============================================================================
return {
  apply(ctx) {
    const fs = ctx.get('fs')
    if (fs === undefined) return
    const join = (dir, name) => (String(dir).endsWith('/') ? String(dir) + String(name) : String(dir) + '/' + String(name))
    const errText = (e) => String(e && e.message ? e.message : e)
    const parentOf = (p) => {
      const s = String(p).replace(/\/+$/, '')
      const i = s.lastIndexOf('/')
      return i <= 0 ? (s.startsWith('/') ? '/' : '.') : s.slice(0, i)
    }
    const ls = async (path) => {
      const target = await fs.resolve(path || '.')
      const entries = await fs.listDir(target)
      const items = entries
        .filter((e) => e.type === 'file' || e.type === 'directory')
        .map((e) => ({ name: e.name, type: e.type, size: e.size }))
      return { ok: true, path: target.displayPath, items }
    }
    harness.handle('md/ls', async (args) => {
      try { return await ls(args.path) }
      catch (e) { return { ok: false, error: errText(e) } }
    })
    harness.handle('md/up', async (args) => {
      try { return await ls(parentOf(args.path)) }
      catch (e) { return { ok: false, error: errText(e) } }
    })
    harness.handle('md/readFile', async (args) => {
      try {
        const target = await fs.resolve(String(args.path))
        const content = await fs.readText(target)
        return { ok: true, content }
      } catch (e) {
        return { ok: false, error: errText(e) }
      }
    })
    harness.handle('md/export', async (args) => {
      try {
        const path = join(args.dir, args.name)
        const target = await fs.resolve(path)
        await fs.writeText(target, String(args.content))
        return { ok: true, path }
      } catch (e) {
        return { ok: false, error: errText(e) }
      }
    })
  },
}