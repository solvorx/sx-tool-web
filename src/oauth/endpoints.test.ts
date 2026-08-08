import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAuthorizeUrl,
  exchangeCode,
  refreshTokens,
  revokeToken,
  ssoLogout,
  userinfo,
} from './endpoints'

/**
 * Único módulo que arma URLs y bodies de OAuth -ver AGENTS.md §3-, y el que
 * guarda por escrito tres de las reglas no negociables del §2: nunca se manda
 * `client_secret` (regla 2), `redirect_uri` no se toca (regla 6), `revoke`
 * manda el token que recibe tal cual (regla 5).
 */

const ISSUER = 'http://localhost:9000'
const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('buildAuthorizeUrl', () => {
  it('arma la URL con response_type=code, S256 y los scopes unidos por espacio', () => {
    const url = buildAuthorizeUrl(ISSUER, {
      clientId: 'sx-console-web',
      redirectUri: 'http://localhost:3002/callback',
      scopes: ['openid', 'profile', 'email'],
      state: 'the-state',
      codeChallenge: 'the-challenge',
    })

    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(`${ISSUER}/v1/public/oauth/authorize`)
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('client_id')).toBe('sx-console-web')
    expect(parsed.searchParams.get('scope')).toBe('openid profile email')
    expect(parsed.searchParams.get('state')).toBe('the-state')
    expect(parsed.searchParams.get('code_challenge')).toBe('the-challenge')
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('no agrega prompt si no se pasó', () => {
    const url = buildAuthorizeUrl(ISSUER, {
      clientId: 'c',
      redirectUri: 'http://localhost:3002/callback',
      scopes: ['openid'],
      state: 's',
      codeChallenge: 'ch',
    })

    expect(new URL(url).searchParams.has('prompt')).toBe(false)
  })

  it('agrega prompt solo cuando se pasó explícitamente', () => {
    const url = buildAuthorizeUrl(ISSUER, {
      clientId: 'c',
      redirectUri: 'http://localhost:3002/callback',
      scopes: ['openid'],
      state: 's',
      codeChallenge: 'ch',
      prompt: 'login',
    })

    expect(new URL(url).searchParams.get('prompt')).toBe('login')
  })

  it('no modifica redirect_uri -regla 6: SXMS la compara byte a byte-', () => {
    const url = buildAuthorizeUrl(ISSUER, {
      clientId: 'c',
      redirectUri: 'http://localhost:3002/callback/',
      scopes: ['openid'],
      state: 's',
      codeChallenge: 'ch',
    })

    expect(new URL(url).searchParams.get('redirect_uri')).toBe('http://localhost:3002/callback/')
  })
})

describe('exchangeCode / refreshTokens / revokeToken / userinfo / ssoLogout', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function lastFetchCall(): [string, RequestInit | undefined] {
    const calls = vi.mocked(globalThis.fetch).mock.calls
    const call = calls.at(-1)
    if (!call) throw new Error('fetch no fue llamado')
    return call as [string, RequestInit | undefined]
  }

  function bodyParams(init: RequestInit | undefined): URLSearchParams {
    if (!(init?.body instanceof URLSearchParams)) throw new Error('body no es URLSearchParams')
    return init.body
  }

  it('exchangeCode: POST form-urlencoded, grant_type=authorization_code y sin client_secret', async () => {
    await exchangeCode(ISSUER, {
      clientId: 'sx-console-web',
      redirectUri: 'http://localhost:3002/callback',
      code: 'the-code',
      codeVerifier: 'the-verifier',
    })

    const [url, init] = lastFetchCall()
    expect(url).toBe(`${ISSUER}/v1/public/oauth/token`)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })

    const body = bodyParams(init)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('client_id')).toBe('sx-console-web')
    expect(body.get('code')).toBe('the-code')
    expect(body.get('redirect_uri')).toBe('http://localhost:3002/callback')
    expect(body.get('code_verifier')).toBe('the-verifier')
    // Regla 2: este paquete es para clientes públicos, nunca se manda client_secret.
    expect(body.has('client_secret')).toBe(false)
  })

  it('refreshTokens: grant_type=refresh_token y sin client_secret', async () => {
    await refreshTokens(ISSUER, 'sx-console-web', 'the-refresh-token')

    const [url, init] = lastFetchCall()
    expect(url).toBe(`${ISSUER}/v1/public/oauth/token`)
    expect(init?.method).toBe('POST')

    const body = bodyParams(init)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('client_id')).toBe('sx-console-web')
    expect(body.get('refresh_token')).toBe('the-refresh-token')
    expect(body.has('client_secret')).toBe(false)
  })

  it('revokeToken: manda el token que recibe, form-encoded (regla 5)', async () => {
    await revokeToken(ISSUER, 'sx-console-web', 'the-access-token')

    const [url, init] = lastFetchCall()
    expect(url).toBe(`${ISSUER}/v1/public/oauth/revoke`)
    expect(init?.method).toBe('POST')

    const body = bodyParams(init)
    expect(body.get('token')).toBe('the-access-token')
    expect(body.get('client_id')).toBe('sx-console-web')
  })

  it('userinfo: GET con Authorization Bearer', async () => {
    await userinfo(ISSUER, 'the-access-token')

    const [url, init] = lastFetchCall()
    expect(url).toBe(`${ISSUER}/v1/public/oauth/userinfo`)
    expect(init?.method).toBe('GET')
    expect(init?.headers).toEqual({ Authorization: 'Bearer the-access-token' })
  })

  it('ssoLogout: POST con credentials: include', async () => {
    await ssoLogout(ISSUER)

    const [url, init] = lastFetchCall()
    expect(url).toBe(`${ISSUER}/v1/public/oauth/logout`)
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
  })
})
