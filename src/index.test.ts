import { describe, expect, it } from 'vitest'
import * as pkg from './index'
import { registerSolvorxElements, SxLoginButton, SxUserMenu } from './index'

/**
 * `index.ts` es la única superficie pública (ver AGENTS.md §3) y el paquete
 * es `sideEffects: false` (regla 11): estos dos hechos son los que este
 * archivo prueba, y ninguno de los tests por módulo los cubre.
 */

describe('index · sideEffects: false', () => {
  // Tiene que ser el primer test del archivo: una vez que algún otro test
  // llama a registerSolvorxElements(), no hay forma de "desregistrar" un
  // Custom Element en jsdom para volver a este estado.
  it('importar index.ts no registra Custom Elements por sí solo', () => {
    expect(customElements.get('sx-login-button')).toBeUndefined()
    expect(customElements.get('sx-user-menu')).toBeUndefined()
  })
})

describe('index · contrato de la superficie pública', () => {
  it('exporta exactamente los valores esperados, ni uno más ni uno menos', () => {
    const expected = [
      'CLIENT_ERROR_CODE',
      'SolvorxError',
      'SxLoginButton',
      'SxUserMenu',
      'createLocalStorageTokenStorage',
      'createMemoryTokenStorage',
      'createSessionStorageTokenStorage',
      'createSolvorxBffClient',
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
    ].sort()

    expect(Object.keys(pkg).sort()).toEqual(expected)
  })
})

describe('registerSolvorxElements()', () => {
  it('registra <sx-login-button> y <sx-user-menu>', () => {
    registerSolvorxElements()

    expect(customElements.get('sx-login-button')).toBe(SxLoginButton)
    expect(customElements.get('sx-user-menu')).toBe(SxUserMenu)
  })

  it('llamarla dos veces no tira -guarda con customElements.get() antes de define()-', () => {
    expect(() => {
      registerSolvorxElements()
      registerSolvorxElements()
    }).not.toThrow()
  })

  it('no explota si customElements no existe (SSR)', () => {
    const original = globalThis.customElements
    Reflect.deleteProperty(globalThis, 'customElements')

    try {
      expect(() => registerSolvorxElements()).not.toThrow()
    } finally {
      globalThis.customElements = original
    }
  })
})
