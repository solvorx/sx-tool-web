#!/usr/bin/env node
/**
 * Smoke test del artefacto construido: nada más en el repo verifica que
 * `dist/` se pueda *consumir* de verdad -ni desde ESM ni desde CJS-, que es
 * la promesa central de este paquete para quien lo instala. Corre después de
 * `pnpm build` (`pnpm check:package` hace ambas cosas).
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

// Misma lista que `src/index.test.ts` -"contrato de la superficie pública"-,
// pero acá se verifica sobre el artefacto compilado, no sobre el código
// fuente: es la diferencia entre "el código exporta esto" y "lo que se instala
// exporta esto".
const EXPECTED_EXPORTS = [
  'CLIENT_ERROR_CODE',
  'SolvorxError',
  'SxLoginButton',
  'SxUserMenu',
  'createLocalStorageTokenStorage',
  'createMemoryTokenStorage',
  'createSessionStorageTokenStorage',
  'createSolvorxClient',
  'getDefaultClient',
  'isForbidden',
  'isRateLimited',
  'isSessionMissing',
  'isUnauthorized',
  'mountUserMenu',
  'readAccessTokenClaims',
  'registerSolvorxElements',
  'setDefaultClient',
]

const failures = []
function check(condition, message) {
  if (!condition) failures.push(message)
}

const distIndexJs = join(ROOT, 'dist', 'index.js')
const distIndexCjs = join(ROOT, 'dist', 'index.cjs')

if (!existsSync(distIndexJs) || !existsSync(distIndexCjs)) {
  console.error(`Falta dist/index.js o dist/index.cjs.\n\nCorré "pnpm build" primero.`)
  process.exit(1)
}

// ── ESM ──────────────────────────────────────────────────────────────────
const esm = await import(pathToFileURL(distIndexJs).href)
for (const name of EXPECTED_EXPORTS) {
  check(name in esm, `ESM: falta el export "${name}" en dist/index.js`)
}

// ── CJS ──────────────────────────────────────────────────────────────────
const cjs = require(distIndexCjs)
for (const name of EXPECTED_EXPORTS) {
  check(name in cjs, `CJS: falta el export "${name}" en dist/index.cjs`)
}

// ── Tipos ────────────────────────────────────────────────────────────────
check(existsSync(join(ROOT, 'dist', 'index.d.ts')), 'Falta dist/index.d.ts')
check(existsSync(join(ROOT, 'dist', 'index.d.cts')), 'Falta dist/index.d.cts')

// ── Cero dependencias de runtime: la promesa central del paquete ──────────
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const dependencyNames = Object.keys(pkg.dependencies ?? {})
check(
  dependencyNames.length === 0,
  `package.json tiene dependencies (${dependencyNames.join(', ')}) -el paquete promete cero dependencias de runtime.`,
)

if (failures.length > 0) {
  console.error('check:package falló:\n')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}

console.log(
  `check:package OK -${EXPECTED_EXPORTS.length} exports verificados en ESM y CJS, .d.ts/.d.cts presentes, dependencies vacío.`,
)
