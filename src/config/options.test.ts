import { afterEach, describe, expect, it } from 'vitest'
import type { TokenStorage } from '../session/token-store'
import { resolveOptions } from './options'

const BASE = { issuer: 'https://x.com', clientId: 'test-client', redirectUri: 'https://x.com/callback' }

describe('resolveOptions · validación', () => {
  it('lanza si falta issuer', () => {
    expect(() => resolveOptions({ ...BASE, issuer: '' })).toThrow(/issuer/)
  })

  it('lanza si falta clientId', () => {
    expect(() => resolveOptions({ ...BASE, clientId: '' })).toThrow(/clientId/)
  })

  it('lanza si falta redirectUri', () => {
    expect(() => resolveOptions({ ...BASE, redirectUri: '' })).toThrow(/redirectUri/)
  })
})

describe('resolveOptions · normalización', () => {
  it('saca la(s) barra(s) final(es) del issuer', () => {
    const resolved = resolveOptions({ ...BASE, issuer: 'https://x.com///' })
    expect(resolved.issuer).toBe('https://x.com')
  })

  it('NO normaliza redirectUri -regla 6: SXMS la compara byte a byte, normalizar acá escondería el problema hasta production-', () => {
    const resolved = resolveOptions({ ...BASE, redirectUri: 'https://x.com/callback/' })
    expect(resolved.redirectUri).toBe('https://x.com/callback/')
  })
})

describe('resolveOptions · defaults', () => {
  it('scopes por default: openid, profile, email', () => {
    expect(resolveOptions(BASE).scopes).toEqual(['openid', 'profile', 'email'])
  })

  it('accountUrl por default: https://account.solvorx.com', () => {
    expect(resolveOptions(BASE).accountUrl).toBe('https://account.solvorx.com')
  })
})

describe('resolveOptions · storage', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it("'localStorage' (default) persiste bajo la clave namespaced por clientId", () => {
    const resolved = resolveOptions(BASE)
    resolved.storage.setRefreshToken('tok')

    expect(localStorage.getItem('sx:test-client:refresh_token')).toBe('tok')
    expect(sessionStorage.getItem('sx:test-client:refresh_token')).toBeNull()
  })

  it("'sessionStorage' persiste en sessionStorage, no en localStorage", () => {
    const resolved = resolveOptions({ ...BASE, storage: 'sessionStorage' })
    resolved.storage.setRefreshToken('tok')

    expect(sessionStorage.getItem('sx:test-client:refresh_token')).toBe('tok')
    expect(localStorage.getItem('sx:test-client:refresh_token')).toBeNull()
  })

  it("'memory' no toca ni localStorage ni sessionStorage", () => {
    const resolved = resolveOptions({ ...BASE, storage: 'memory' })
    resolved.storage.setRefreshToken('tok')

    expect(resolved.storage.getRefreshToken()).toBe('tok')
    expect(localStorage.getItem('sx:test-client:refresh_token')).toBeNull()
    expect(sessionStorage.getItem('sx:test-client:refresh_token')).toBeNull()
  })

  it('una implementación propia de TokenStorage pasa tal cual, sin envolver', () => {
    const custom: TokenStorage = {
      getRefreshToken: () => 'custom-token',
      setRefreshToken: () => {},
    }

    expect(resolveOptions({ ...BASE, storage: custom }).storage).toBe(custom)
  })

  it('un objeto que solo tiene getRefreshToken no cuenta como TokenStorage', () => {
    const almostStorage = { getRefreshToken: () => null }

    const resolved = resolveOptions({ ...BASE, storage: almostStorage as unknown as TokenStorage })

    // No pasa el chequeo de forma (le falta setRefreshToken), así que no se
    // acepta tal cual -no es el mismo objeto que se le pasó a resolveOptions-.
    expect(resolved.storage).not.toBe(almostStorage)
  })
})
