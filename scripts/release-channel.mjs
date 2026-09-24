#!/usr/bin/env node
/**
 * Decide por qué canal sale un release -y lo frena si no cuadra- antes de que llegue al registry.
 *
 * Dos ramas largas, dos canales, y la versión del `package.json` es la que manda:
 *
 *   main → X.Y.Z         → dist-tag `latest` (lo que instala `pnpm add @solvorx/sx-tool-web`)
 *   beta → X.Y.Z-beta.N  → dist-tag `beta`   (sólo lo instala quien lo pide explícito)
 *
 * El canal NO sale del `target_commitish` del release: GitHub lo ignora cuando el tag ya existe, así
 * que no garantiza de qué rama viene el commit. Sale de dónde está el commit de verdad y de la
 * versión que se va a publicar. Cada chequeo cubre un error que no avisa: una beta publicada como
 * `latest` le llega a todo el que instala sin versión, y una estable publicada desde una rama de
 * feature queda en el registry sin haber pasado por `main`.
 *
 * Corre en `publish.yaml`, y también a mano antes de crear el release (ver "Publicar" en el README).
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const STABLE = /^\d+\.\d+\.\d+$/
const BETA = /^\d+\.\d+\.\d+-beta\.\d+$/

/**
 * @param {{ version: string, tag: string, prerelease: boolean, onMain: boolean, onBeta: boolean }} release
 * @returns {{ distTag: 'latest' | 'beta' | null, errors: string[] }}
 */
export function resolveReleaseChannel({ version, tag, prerelease, onMain, onBeta }) {
  const errors = []

  if (tag !== `v${version}`) {
    errors.push(
      `el tag es "${tag}" pero package.json dice "${version}" -tienen que coincidir (v${version}), o el release anuncia una versión y se publica otra.`,
    )
  }

  if (STABLE.test(version)) {
    if (prerelease) {
      errors.push(`${version} es estable pero el release está marcado como pre-release -o se desmarca, o la versión lleva -beta.N.`)
    }
    if (!onMain) {
      errors.push(`${version} es estable y su commit no está en main -una estable sale de main; si viene de beta, primero se mergea beta a main.`)
    }
    return { distTag: errors.length > 0 ? null : 'latest', errors }
  }

  if (BETA.test(version)) {
    if (!prerelease) {
      errors.push(`${version} es beta pero el release no está marcado como pre-release -sin la marca, GitHub la muestra como la versión vigente.`)
    }
    if (!onBeta) {
      errors.push(`${version} es beta y su commit no está en beta -una beta sale de la rama beta.`)
    }
    return { distTag: errors.length > 0 ? null : 'beta', errors }
  }

  errors.push(`"${version}" no es estable (X.Y.Z) ni beta (X.Y.Z-beta.N) -son los dos únicos canales configurados.`)
  return { distTag: null, errors }
}

// ── CLI ───────────────────────────────────────────────────────────────────
// Sólo cuando se ejecuta directo: el test importa `resolveReleaseChannel` y no debe tocar git.
const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

  const commitIsOn = (branch) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', `origin/${branch}`], { cwd: ROOT, stdio: 'ignore' })
      return true
    } catch {
      // Código 1 = no es ancestro; cualquier otro = la rama no existe todavía. Para decidir el canal
      // significan lo mismo: el commit no está en esa rama.
      return false
    }
  }

  const tag = process.env.RELEASE_TAG
  if (!tag) {
    console.error('Falta RELEASE_TAG (ej: RELEASE_TAG=v0.6.0 RELEASE_PRERELEASE=false node scripts/release-channel.mjs).')
    process.exit(1)
  }

  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const { distTag, errors } = resolveReleaseChannel({
    version,
    tag,
    prerelease: process.env.RELEASE_PRERELEASE === 'true',
    onMain: commitIsOn('main'),
    onBeta: commitIsOn('beta'),
  })

  if (errors.length > 0) {
    console.error('release-channel falló:\n')
    for (const error of errors) console.error(`  ✗ ${error}`)
    process.exit(1)
  }

  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `dist_tag=${distTag}\n`)
  console.log(`release-channel OK -${version} sale por el canal "${distTag}".`)
}
