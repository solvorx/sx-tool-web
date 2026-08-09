import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as endpoints from '../oauth/endpoints'
import { createSolvorxServerClient } from './index'

vi.mock('../oauth/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../oauth/endpoints')>()
  return {
    ...actual,
    exchangeCode: vi.fn(),
    refreshTokens: vi.fn(),
    revokeToken: vi.fn(),
    userinfo: vi.fn(),
  }
})

const exchangeCodeMock = vi.mocked(endpoints.exchangeCode)
const refreshTokensMock = vi.mocked(endpoints.refreshTokens)
const revokeTokenMock = vi.mocked(endpoints.revokeToken)
const userinfoMock = vi.mocked(endpoints.userinfo)
const buildAuthorizeUrlSpy = vi.spyOn(endpoints, 'buildAuthorizeUrl')

const baseOptions = {
  issuer: 'http://localhost:9000',
  clientId: 'sx-account-web',
  clientSecret: 'super-secret',
  redirectUri: 'http://localhost:3001/api/auth/callback',
} as const

const fakeTokens = {
  access_token: 'access-1',
  token_type: 'Bearer',
  expires_in: 600,
  refresh_token: 'refresh-1',
}

beforeEach(() => {
  exchangeCodeMock.mockReset().mockResolvedValue(fakeTokens)
  refreshTokensMock.mockReset().mockResolvedValue(fakeTokens)
  revokeTokenMock.mockReset().mockResolvedValue(undefined)
  userinfoMock.mockReset()
  buildAuthorizeUrlSpy.mockClear()
})

describe('createSolvorxServerClient', () => {
  it('valida las opciones requeridas', () => {
    expect(() => createSolvorxServerClient({ ...baseOptions, issuer: '' })).toThrow(/issuer/)
    expect(() => createSolvorxServerClient({ ...baseOptions, clientId: '' })).toThrow(/clientId/)
    expect(() => createSolvorxServerClient({ ...baseOptions, redirectUri: '' })).toThrow(/redirectUri/)
  })

  it('buildAuthorizeUrl arma la URL con clientId y redirectUri configurados', () => {
    const client = createSolvorxServerClient(baseOptions)

    const url = client.buildAuthorizeUrl({ state: 'state-1', codeChallenge: 'challenge-1' })

    expect(buildAuthorizeUrlSpy).toHaveBeenCalledWith('http://localhost:9000', {
      clientId: 'sx-account-web',
      redirectUri: 'http://localhost:3001/api/auth/callback',
      scopes: ['openid', 'profile', 'email'],
      state: 'state-1',
      codeChallenge: 'challenge-1',
    })
    expect(url).toContain('client_id=sx-account-web')
  })

  it('exchangeCode manda el clientSecret configurado -es el prerrequisito del BFF', async () => {
    const client = createSolvorxServerClient(baseOptions)

    await client.exchangeCode({ code: 'code-1', codeVerifier: 'verifier-1' })

    expect(exchangeCodeMock).toHaveBeenCalledWith('http://localhost:9000', {
      clientId: 'sx-account-web',
      clientSecret: 'super-secret',
      redirectUri: 'http://localhost:3001/api/auth/callback',
      code: 'code-1',
      codeVerifier: 'verifier-1',
    })
  })

  it('sin clientSecret configurado, no lo manda -sigue sirviendo para un cliente público desde el servidor', async () => {
    const client = createSolvorxServerClient({ ...baseOptions, clientSecret: undefined })

    await client.exchangeCode({ code: 'code-1', codeVerifier: 'verifier-1' })

    expect(exchangeCodeMock).toHaveBeenCalledWith(
      'http://localhost:9000',
      expect.not.objectContaining({ clientSecret: expect.anything() }),
    )
  })

  it('refreshTokens y revokeToken también mandan el clientSecret', async () => {
    const client = createSolvorxServerClient(baseOptions)

    await client.refreshTokens('refresh-1')
    expect(refreshTokensMock).toHaveBeenCalledWith('http://localhost:9000', 'sx-account-web', 'refresh-1', 'super-secret')

    await client.revokeToken('access-1')
    expect(revokeTokenMock).toHaveBeenCalledWith('http://localhost:9000', 'sx-account-web', 'access-1', 'super-secret')
  })

  it('userinfo no necesita clientSecret -es un GET con Bearer, no autentica al cliente', async () => {
    userinfoMock.mockResolvedValue({
      sub: '1',
      name: 'Ana López',
      preferred_username: 'ana-48213',
      email: 'ana@example.com',
      email_verified: true,
      phone_number_verified: false,
      project: { id: 1, code: 'sx_management', name: 'SolvorX' },
      permissions: [],
    })
    const client = createSolvorxServerClient(baseOptions)

    const user = await client.userinfo('access-1')

    expect(userinfoMock).toHaveBeenCalledWith('http://localhost:9000', 'access-1')
    expect(user.name).toBe('Ana López')
  })

  it('buildAuthorizeUrl agrega prompt solo cuando se pasa explícitamente', () => {
    const client = createSolvorxServerClient(baseOptions)

    client.buildAuthorizeUrl({ state: 's', codeChallenge: 'c', prompt: 'login' })

    expect(buildAuthorizeUrlSpy).toHaveBeenCalledWith(
      'http://localhost:9000',
      expect.objectContaining({ prompt: 'login' }),
    )
  })

  it('saca la barra final del issuer, igual que createSolvorxClient', () => {
    const client = createSolvorxServerClient({ ...baseOptions, issuer: 'http://localhost:9000/' })

    client.buildAuthorizeUrl({ state: 's', codeChallenge: 'c' })

    expect(buildAuthorizeUrlSpy).toHaveBeenCalledWith('http://localhost:9000', expect.anything())
  })
})
