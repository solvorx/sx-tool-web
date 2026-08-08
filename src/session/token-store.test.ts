import { beforeEach, describe, expect, it } from 'vitest'
import {
  createLocalStorageTokenStorage,
  createMemoryTokenStorage,
  createSessionStorageTokenStorage,
  type TokenStorage,
} from './token-store'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe.each([
  ['localStorage', () => createLocalStorageTokenStorage('test-client')],
  ['sessionStorage', () => createSessionStorageTokenStorage('test-client')],
  ['memory', () => createMemoryTokenStorage()],
])('%s', (_name, create) => {
  let store: TokenStorage

  beforeEach(() => {
    store = create()
  })

  it('empieza sin token', () => {
    expect(store.getRefreshToken()).toBeNull()
  })

  it('guarda y devuelve el token', () => {
    store.setRefreshToken('refresh-abc')
    expect(store.getRefreshToken()).toBe('refresh-abc')
  })

  it('borra el token al setear null', () => {
    store.setRefreshToken('refresh-abc')
    store.setRefreshToken(null)
    expect(store.getRefreshToken()).toBeNull()
  })

  it('sobrescribe un token con otro', () => {
    store.setRefreshToken('first')
    store.setRefreshToken('second')
    expect(store.getRefreshToken()).toBe('second')
  })
})

describe('namespacing', () => {
  it('dos clientes distintos en localStorage no se pisan el token', () => {
    const a = createLocalStorageTokenStorage('client-a')
    const b = createLocalStorageTokenStorage('client-b')

    a.setRefreshToken('token-a')
    b.setRefreshToken('token-b')

    expect(a.getRefreshToken()).toBe('token-a')
    expect(b.getRefreshToken()).toBe('token-b')
  })
})
