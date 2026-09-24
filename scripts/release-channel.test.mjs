import { describe, expect, it } from 'vitest'
import { resolveReleaseChannel } from './release-channel.mjs'

/**
 * Cada caso es una forma de armar mal un release en GitHub. Ninguna da error en el registry: el
 * paquete se publica igual, y el daño aparece cuando alguien lo instala.
 */
const STABLE_ON_MAIN = { version: '0.7.0', tag: 'v0.7.0', prerelease: false, onMain: true, onBeta: false }
const BETA_ON_BETA = { version: '0.7.0-beta.1', tag: 'v0.7.0-beta.1', prerelease: true, onMain: false, onBeta: true }

describe('resolveReleaseChannel', () => {
  it('una estable desde main sale por latest', () => {
    expect(resolveReleaseChannel(STABLE_ON_MAIN)).toEqual({ distTag: 'latest', errors: [] })
  })

  it('una beta desde beta, marcada como pre-release, sale por beta', () => {
    expect(resolveReleaseChannel(BETA_ON_BETA)).toEqual({ distTag: 'beta', errors: [] })
  })

  /** Después de sincronizar `main → beta`, el commit de una estable está en las dos ramas. */
  it('una estable que ya se sincronizó a beta sigue saliendo por latest', () => {
    expect(resolveReleaseChannel({ ...STABLE_ON_MAIN, onBeta: true }).distTag).toBe('latest')
  })

  it('el tag tiene que coincidir con la versión del package.json', () => {
    const result = resolveReleaseChannel({ ...STABLE_ON_MAIN, tag: 'v0.8.0' })

    expect(result.distTag).toBeNull()
    expect(result.errors[0]).toContain('v0.7.0')
  })

  /** Promover sin mergear: la estable quedaría publicada sin que `main` la tenga. */
  it('una estable cuyo commit sólo está en beta no se publica', () => {
    const result = resolveReleaseChannel({ ...STABLE_ON_MAIN, onMain: false, onBeta: true })

    expect(result.distTag).toBeNull()
    expect(result.errors).toHaveLength(1)
  })

  it('una estable marcada como pre-release no se publica', () => {
    expect(resolveReleaseChannel({ ...STABLE_ON_MAIN, prerelease: true }).distTag).toBeNull()
  })

  /** Sin la marca, GitHub la pone como "Latest release" en la página del repo. */
  it('una beta sin marcar como pre-release no se publica', () => {
    expect(resolveReleaseChannel({ ...BETA_ON_BETA, prerelease: false }).distTag).toBeNull()
  })

  /** El caso de mergear `beta → main` y olvidarse de sacarle el `-beta.N` a la versión. */
  it('una beta cuyo commit no está en beta no se publica', () => {
    expect(resolveReleaseChannel({ ...BETA_ON_BETA, onMain: true, onBeta: false }).distTag).toBeNull()
  })

  it('un commit que no está en ninguna de las dos -una rama de feature- no se publica', () => {
    const result = resolveReleaseChannel({ ...STABLE_ON_MAIN, onMain: false })

    expect(result.distTag).toBeNull()
  })

  it('un canal que no está configurado (alpha, rc) no se publica', () => {
    const result = resolveReleaseChannel({ ...BETA_ON_BETA, version: '0.7.0-rc.1', tag: 'v0.7.0-rc.1' })

    expect(result.distTag).toBeNull()
    expect(result.errors[0]).toContain('X.Y.Z-beta.N')
  })

  it('junta todos los errores en una sola corrida, no el primero nada más', () => {
    const result = resolveReleaseChannel({ ...BETA_ON_BETA, tag: 'v9.9.9', prerelease: false, onBeta: false })

    expect(result.errors).toHaveLength(3)
  })
})
