import { describe, expect, it, vi } from 'vitest'
import { SolvorxError } from '../http/error'
import { isRevokedSessionError, withSessionRecovery } from './session-recovery'

describe('isRevokedSessionError', () => {
  it('reconoce un error plano con status 401', () => {
    expect(isRevokedSessionError({ status: 401 })).toBe(true)
  })

  it('reconoce un SolvorxError 401 -no es instanceof de las clases de las otras apps', () => {
    const error = new SolvorxError({ message: 'Token expired', code: 'http/401', status: 401 })
    expect(isRevokedSessionError(error)).toBe(true)
  })

  it('rechaza cualquier otro status', () => {
    expect(isRevokedSessionError({ status: 500 })).toBe(false)
    expect(isRevokedSessionError({ status: 403 })).toBe(false)
  })

  it('rechaza valores sin status, incluido null y primitivos', () => {
    expect(isRevokedSessionError(null)).toBe(false)
    expect(isRevokedSessionError(undefined)).toBe(false)
    expect(isRevokedSessionError('boom')).toBe(false)
    expect(isRevokedSessionError({ digest: 'NEXT_REDIRECT;replace;/login;307;' })).toBe(false)
  })

  /**
   * `sx-account-web/src/lib/api/payment.ts` habla contra sx-payment-service como MÁQUINA -consumer
   * token + API key de proyecto-, no con el token de la persona. Un 401 ahí no dice nada sobre su
   * sesión -puede ser solo una API key vieja-, así que no debe contar como sesión revocada.
   */
  it('rechaza un 401 marcado isMachinePlane -no es una sesión revocada', () => {
    expect(isRevokedSessionError({ status: 401, isMachinePlane: true })).toBe(false)
  })

  it('un 401 SIN la marca isMachinePlane sigue contando como sesión revocada', () => {
    expect(isRevokedSessionError({ status: 401, isMachinePlane: false })).toBe(true)
    expect(isRevokedSessionError({ status: 401 })).toBe(true)
  })
})

describe('withSessionRecovery', () => {
  it('en éxito, devuelve el valor de load sin llamar a onRevoked', async () => {
    const onRevoked = vi.fn()
    const result = await withSessionRecovery(async () => 'ok', onRevoked)

    expect(result).toBe('ok')
    expect(onRevoked).not.toHaveBeenCalled()
  })

  it('ante un 401 plano, llama a onRevoked y devuelve lo que resuelva', async () => {
    const error = { status: 401 }
    const onRevoked = vi.fn().mockImplementation(async () => {
      throw new Error('nunca debería llegar acá en el test, pero simula redirect()')
    })

    await expect(withSessionRecovery(async () => { throw error }, onRevoked)).rejects.toThrow()
    expect(onRevoked).toHaveBeenCalledWith(error)
  })

  it('ante un SolvorxError 401, también llama a onRevoked -cubre las dos formas', async () => {
    const error = new SolvorxError({ message: 'Token expired', code: 'http/401', status: 401 })
    const onRevoked = vi.fn().mockRejectedValue(error)

    await expect(withSessionRecovery(async () => { throw error }, onRevoked)).rejects.toBe(error)
    expect(onRevoked).toHaveBeenCalledWith(error)
  })

  it('ante un 500, relanza sin llamar a onRevoked', async () => {
    const error = { status: 500 }
    const onRevoked = vi.fn()

    await expect(withSessionRecovery(async () => { throw error }, onRevoked)).rejects.toBe(error)
    expect(onRevoked).not.toHaveBeenCalled()
  })

  it('ante un NEXT_REDIRECT (sin status), relanza sin llamar a onRevoked -no debe romper requireOrganization', async () => {
    const error = { digest: 'NEXT_REDIRECT;replace;/login;307;' }
    const onRevoked = vi.fn()

    await expect(withSessionRecovery(async () => { throw error }, onRevoked)).rejects.toBe(error)
    expect(onRevoked).not.toHaveBeenCalled()
  })

  it('ante un 401 marcado isMachinePlane, relanza sin llamar a onRevoked -no es una sesión revocada', async () => {
    const error = { status: 401, isMachinePlane: true }
    const onRevoked = vi.fn()

    await expect(withSessionRecovery(async () => { throw error }, onRevoked)).rejects.toBe(error)
    expect(onRevoked).not.toHaveBeenCalled()
  })
})
