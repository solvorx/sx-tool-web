import { describe, expect, it } from 'vitest'
import { createCodeVerifier, createState, deriveCodeChallenge } from './pkce'

describe('deriveCodeChallenge', () => {
  /**
   * Vector de prueba del RFC 7636, apéndice B.
   *
   * Vale más que cualquier test propio: si esta derivación se desvía del
   * estándar, el backend responde `invalid_grant` al canjear el código y el
   * login falla entero, sin ninguna pista de por qué.
   */
  it('coincide con el vector del RFC 7636', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'

    await expect(deriveCodeChallenge(verifier)).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })

  it('no deja padding ni caracteres fuera de base64url', async () => {
    const challenge = await deriveCodeChallenge(createCodeVerifier())

    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('createCodeVerifier', () => {
  /** El RFC pide entre 43 y 128 caracteres; un verifier corto es rechazado. */
  it('entra en el rango que exige el RFC y no se repite', () => {
    const verifiers = Array.from({ length: 20 }, createCodeVerifier)

    for (const verifier of verifiers) {
      expect(verifier.length).toBeGreaterThanOrEqual(43)
      expect(verifier.length).toBeLessThanOrEqual(128)
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    }

    expect(new Set(verifiers).size).toBe(verifiers.length)
  })
})

describe('createState', () => {
  it('genera un valor distinto por flujo', () => {
    const states = Array.from({ length: 20 }, createState)

    expect(new Set(states).size).toBe(states.length)
  })
})
