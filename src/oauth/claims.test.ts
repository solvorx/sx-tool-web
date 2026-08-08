import { describe, expect, it } from 'vitest'
import { readAccessTokenClaims } from './claims'

/** Arma un JWT de prueba: header cualquiera + payload en base64url + firma cualquiera. */
function fakeJwt(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const segment = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  return `header.${segment}.signature`
}

describe('readAccessTokenClaims', () => {
  /**
   * Regresión del bug de `atob`: sin el paso a UTF-8, "José Ñáñez" se rompe en
   * caracteres sueltos de la tabla latin-1.
   */
  it('decodifica nombres con acentos sin corromperlos', () => {
    const token = fakeJwt({ sub: 1, sid: 2, pCode: 'sx_management', exp: 1999999999, roles: ['user'] })
    // el claim de nombre no forma parte de AccessTokenClaims, pero probamos el
    // mismo mecanismo de decodeSegment vía un campo real: pCode con acentos.
    const withAccents = fakeJwt({ sub: 1, sid: 2, pCode: 'proyecto_ñoño_é', exp: null, roles: [] })

    expect(readAccessTokenClaims(token)).toEqual({
      sub: 1,
      sid: 2,
      pCode: 'sx_management',
      exp: 1999999999,
      roles: ['user'],
    })
    expect(readAccessTokenClaims(withAccents)?.pCode).toBe('proyecto_ñoño_é')
  })

  it('devuelve null si el token no tiene tres segmentos', () => {
    expect(readAccessTokenClaims('no-es-un-jwt')).toBeNull()
  })

  it('devuelve null si el payload no es JSON válido', () => {
    expect(readAccessTokenClaims('header.not-base64-json.signature')).toBeNull()
  })

  it('devuelve null si faltan sub o sid', () => {
    const token = fakeJwt({ sub: 1, roles: [] })
    expect(readAccessTokenClaims(token)).toBeNull()
  })

  it('filtra roles que no son string y tolera pCode/exp ausentes', () => {
    const token = fakeJwt({ sub: 1, sid: 2, roles: ['admin', 42, null] })
    expect(readAccessTokenClaims(token)).toEqual({
      sub: 1,
      sid: 2,
      pCode: null,
      exp: null,
      roles: ['admin'],
    })
  })
})
