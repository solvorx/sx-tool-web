import { beforeEach, describe, expect, it } from 'vitest'
import { consumeTransaction, sanitizeReturnTo, saveTransaction } from './transaction'

beforeEach(() => {
  sessionStorage.clear()
})

describe('saveTransaction / consumeTransaction', () => {
  it('guarda y devuelve la misma transacción', () => {
    saveTransaction({ state: 's1', codeVerifier: 'v1', returnTo: '/dashboard' })

    expect(consumeTransaction()).toEqual({ state: 's1', codeVerifier: 'v1', returnTo: '/dashboard' })
  })

  it('es de un solo uso: consumirla la borra', () => {
    saveTransaction({ state: 's1', codeVerifier: 'v1', returnTo: '/' })

    consumeTransaction()

    expect(consumeTransaction()).toBeNull()
  })

  it('devuelve null si no hay transacción guardada', () => {
    expect(consumeTransaction()).toBeNull()
  })

  it('devuelve null ante un valor corrupto en sessionStorage', () => {
    sessionStorage.setItem('sx_txn', 'no es json')

    expect(consumeTransaction()).toBeNull()
  })

  it('devuelve null si falta algún campo', () => {
    sessionStorage.setItem('sx_txn', JSON.stringify({ state: 's1' }))

    expect(consumeTransaction()).toBeNull()
  })
})

/**
 * El caso que importa de verdad: si el `state` que vuelve del callback no
 * coincide con el guardado, quien llama a `init()` tiene que rechazar el
 * canje. `consumeTransaction()` no compara -eso es responsabilidad de
 * `core/client.ts`-, pero el contrato (state legible, de un solo uso) es lo
 * que lo hace posible.
 */
describe('contrato para la comparación de state en el callback', () => {
  it('la transacción consumida expone el state original para comparar', () => {
    saveTransaction({ state: 'expected-state', codeVerifier: 'v1', returnTo: '/' })

    const txn = consumeTransaction()
    const stateFromCallback = 'tampered-state'

    expect(txn?.state).toBe('expected-state')
    expect(txn?.state === stateFromCallback).toBe(false)
  })
})

describe('sanitizeReturnTo', () => {
  it('acepta un path relativo', () => {
    expect(sanitizeReturnTo('/dashboard?tab=1')).toBe('/dashboard?tab=1')
  })

  it('rechaza una URL protocol-relative', () => {
    expect(sanitizeReturnTo('//evil.com')).toBe('/')
  })

  it('rechaza una URL absoluta con esquema', () => {
    expect(sanitizeReturnTo('https://evil.com')).toBe('/')
  })

  it('rechaza javascript: disfrazado de path', () => {
    expect(sanitizeReturnTo('/\\evil.com')).toBe('/')
  })

  it('usa el fallback dado cuando no hay valor', () => {
    expect(sanitizeReturnTo(null, '/home')).toBe('/home')
  })
})
