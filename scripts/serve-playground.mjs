#!/usr/bin/env node
/**
 * Server HTTP cero-deps para probar el paquete contra SXMS real en `:3002`.
 *
 * Puerto fijo, no configurable: la `redirect_uri` del cliente OAuth seedeado
 * (`sx-console-web`, ver `sx-management-service/prisma/seed.ts`) es
 * `http://localhost:3002/callback`. Correrse de puerto rompe OAuth en
 * silencio -mismo criterio que `strictPort: true` en
 * `sx-identity-web/vite.config.ts`-, así que si el puerto está ocupado esto
 * falla con un mensaje claro en vez de levantar en otro lado.
 *
 * Sirve `playground/` como una SPA: cualquier ruta que no sea `/dist/*` ni
 * `/app.js` -incluida `/callback`, adonde vuelve el redirect de OAuth- devuelve
 * `playground/index.html`. Un server estático común no alcanza acá porque
 * `/callback` no es un archivo.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3002
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const DIST_DIR = join(ROOT, 'dist')
const PLAYGROUND_DIR = join(ROOT, 'playground')
const INDEX_HTML = join(PLAYGROUND_DIR, 'index.html')

const MIME_TYPES = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.map': 'application/json',
  '.json': 'application/json',
}

/** Resuelve `urlPath` bajo `baseDir` y devuelve `null` si el resultado se escapa de `baseDir` (path traversal). */
function safeResolve(baseDir, urlPath) {
  const candidate = resolve(baseDir, `.${normalize(urlPath)}`)
  if (candidate !== baseDir && !candidate.startsWith(`${baseDir}/`)) return null
  return candidate
}

async function serveFile(res, filePath) {
  const body = await readFile(filePath)
  const type = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  try {
    if (url.pathname.startsWith('/dist/')) {
      const filePath = safeResolve(DIST_DIR, url.pathname.slice('/dist'.length))
      if (!filePath) {
        res.writeHead(400).end('Bad request')
        return
      }
      await serveFile(res, filePath)
      return
    }

    if (url.pathname === '/app.js') {
      await serveFile(res, join(PLAYGROUND_DIR, 'app.js'))
      return
    }

    // Fallback tipo SPA: sirve index.html para `/`, `/callback`, y cualquier
    // otra ruta -es lo que un server estático común no hace, y por lo que el
    // README explícitamente aclara que no alcanza.
    await serveFile(res, INDEX_HTML)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      res.writeHead(404).end('Not found')
      return
    }
    res.writeHead(500).end('Internal error')
    console.error(error)
  }
}

async function main() {
  const distEntry = join(DIST_DIR, 'index.js')
  const exists = await stat(distEntry).then(
    () => true,
    () => false,
  )
  if (!exists) {
    console.error(`No existe ${distEntry}.\n\nCorré "pnpm build" primero.`)
    process.exit(1)
  }

  const server = createServer((req, res) => {
    void handle(req, res)
  })

  server.on('error', (error) => {
    if ('code' in error && error.code === 'EADDRINUSE') {
      console.error(
        `El puerto ${PORT} ya está en uso. Es el puerto fijo de la redirect_uri seedeada ` +
          `(http://localhost:${PORT}/callback) -no se puede correr en otro. Liberalo e intentá de nuevo.`,
      )
      process.exit(1)
    }
    throw error
  })

  server.listen(PORT, () => {
    console.log(`Playground en http://localhost:${PORT}`)
  })
}

void main()
