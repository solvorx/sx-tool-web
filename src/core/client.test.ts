import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSessionMissing, SolvorxError } from '../http/error'
import * as endpoints from '../oauth/endpoints'
import type { UserInfo } from '../oauth/endpoints'
import { createMemoryTokenStorage } from '../session/token-store'
import { createSolvorxClient } from './client'

vi.mock('../oauth/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../oauth/endpoints')>()
  return {
    ...actual,
    exchangeCode: vi.fn(),
    refreshTokens: vi.fn(),
    userinfo: vi.fn(),
    revokeToken: vi.fn(),
    ssoLogout: vi.fn(),
  }
})

const exchangeCodeMock = vi.mocked(endpoints.exchangeCode)
const refreshTokensMock = vi.mocked(endpoints.refreshTokens)
const userinfoMock = vi.mocked(endpoints.userinfo)
const revokeTokenMock = vi.mocked(endpoints.revokeToken)
const ssoLogoutMock = vi.mocked(endpoints.ssoLogout)
// `buildAuthorizeUrl` es pura -no toca la red-, así que se deja pasar de
// verdad y solo se espía: es la forma de verificar la URL de /authorize sin
// pelear con `window.location.assign`, que en jsdom 30 es una own property
// non-configurable y ni `vi.spyOn` ni una asignación directa la pueden pisar.
// La llamada real a `.assign()` en `login()` queda sin mockear: jsdom la deja
// pasar como un no-op ("Not implemented: navigation"), sin tirar.
const buildAuthorizeUrlSpy = vi.spyOn(endpoints, 'buildAuthorizeUrl')

const baseOptions = {
  issuer: 'http://localhost:9000',
  clientId: 'sx-console-web',
  redirectUri: 'http://localhost:3002/callback',
} as const

function fakeUser(): UserInfo {
  return {
    sub: '1',
    name: 'Ana López',
    preferred_username: 'ana-48213',
    email: 'ana@example.com',
    email_verified: true,
    phone_number_verified: false,
    project: { id: 1, code: 'sx_management', name: 'SolvorX' },
    permissions: [],
  }
}

beforeEach(() => {
  exchangeCodeMock.mockReset()
  refreshTokensMock.mockReset()
  userinfoMock.mockReset()
  revokeTokenMock.mockReset().mockResolvedValue(undefined)
  ssoLogoutMock.mockReset().mockResolvedValue(undefined)
  buildAuthorizeUrlSpy.mockClear()
  sessionStorage.clear()
  localStorage.clear()
  window.history.pushState({}, '', '/')
})

describe('init · sin sesión', () => {
  it('termina unauthenticated si no hay refresh token guardado ni callback en la URL', async () => {
    const client = createSolvorxClient({ ...baseOptions, storage: createMemoryTokenStorage() })

    await client.init()

    expect(client.getStatus()).toBe('unauthenticated')
    expect(client.currentUser()).toBeNull()
    expect(userinfoMock).not.toHaveBeenCalled()
  })
})

describe('init · rehidratación', () => {
  it('renueva con el refresh token guardado y carga el usuario', async () => {
    const storage = createMemoryTokenStorage()
    storage.setRefreshToken('stored-refresh')
    refreshTokensMock.mockResolvedValue({
      access_token: 'access-1',
      token_type: 'Bearer',
      expires_in: 600,
      refresh_token: 'refresh-2',
    })
    userinfoMock.mockResolvedValue(fakeUser())

    const client = createSolvorxClient({ ...baseOptions, storage })
    await client.init()

    expect(refreshTokensMock).toHaveBeenCalledWith('http://localhost:9000', 'sx-console-web', 'stored-refresh')
    expect(client.getStatus()).toBe('authenticated')
    expect(client.currentUser()).toEqual(fakeUser())
  })

  it('si el refresh token guardado ya no sirve, termina unauthenticated sin lanzar', async () => {
    const storage = createMemoryTokenStorage()
    storage.setRefreshToken('dead-refresh')
    refreshTokensMock.mockRejectedValue(
      new SolvorxError({ message: 'El código ya se usó o venció', code: 'invalid_grant', status: 400 }),
    )

    const client = createSolvorxClient({ ...baseOptions, storage })
    await expect(client.init()).resolves.toBeUndefined()

    expect(client.getStatus()).toBe('unauthenticated')
  })
})

describe('login', () => {
  it('guarda la transacción PKCE y navega a /authorize con los parámetros correctos', async () => {
    const client = createSolvorxClient({ ...baseOptions, storage: createMemoryTokenStorage() })

    await client.login({ returnTo: '/dashboard' })

    const txn = JSON.parse(sessionStorage.getItem('sx_txn') ?? 'null')
    expect(txn).toMatchObject({ returnTo: '/dashboard' })
    expect(typeof txn.state).toBe('string')
    expect(typeof txn.codeVerifier).toBe('string')

    expect(buildAuthorizeUrlSpy).toHaveBeenCalledTimes(1)
    const url = new URL(buildAuthorizeUrlSpy.mock.results[0]?.value as string)
    expect(url.origin + url.pathname).toBe('http://localhost:9000/v1/public/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('sx-console-web')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3002/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe(txn.state)
    // Nunca un client_secret: es un cliente público.
    expect(url.searchParams.has('client_secret')).toBe(false)
  })

  it('rechaza un returnTo que apunta fuera del origin', async () => {
    const client = createSolvorxClient({ ...baseOptions, storage: createMemoryTokenStorage() })

    await client.login({ returnTo: 'https://evil.com' })

    const txn = JSON.parse(sessionStorage.getItem('sx_txn') ?? 'null')
    expect(txn.returnTo).toBe('/')
  })
})

describe('init · callback', () => {
  it('canjea el código, limpia la URL a returnTo, y termina autenticado', async () => {
    const storage = createMemoryTokenStorage()
    const client = createSolvorxClient({ ...baseOptions, storage })

    window.history.pushState({}, '', '/start')
    await client.login({ returnTo: '/dashboard' })
    const txn = JSON.parse(sessionStorage.getItem('sx_txn') ?? 'null')

    exchangeCodeMock.mockResolvedValue({
      access_token: 'access-1',
      token_type: 'Bearer',
      expires_in: 600,
      refresh_token: 'refresh-1',
    })
    userinfoMock.mockResolvedValue(fakeUser())

    window.history.pushState({}, '', `/callback?code=abc123&state=${txn.state}`)

    await client.init()

    expect(exchangeCodeMock).toHaveBeenCalledWith('http://localhost:9000', {
      clientId: 'sx-console-web',
      redirectUri: 'http://localhost:3002/callback',
      code: 'abc123',
      codeVerifier: txn.codeVerifier,
    })
    expect(client.getStatus()).toBe('authenticated')
    expect(window.location.pathname).toBe('/dashboard')
    expect(window.location.search).toBe('')
    expect(storage.getRefreshToken()).toBe('refresh-1')
  })

  it('rechaza el canje si el state no coincide, y limpia igual la URL', async () => {
    const storage = createMemoryTokenStorage()
    const client = createSolvorxClient({ ...baseOptions, storage })

    window.history.pushState({}, '', '/start')
    await client.login({ returnTo: '/dashboard' })

    window.history.pushState({}, '', '/callback?code=abc123&state=tampered-state')

    await expect(client.init()).rejects.toThrow(/state/i)

    expect(exchangeCodeMock).not.toHaveBeenCalled()
    expect(client.getStatus()).toBe('unauthenticated')
    expect(window.location.pathname).toBe('/dashboard')
  })

  it('una segunda init() antes de que la primera termine no vuelve a canjear el código (protege contra el doble montaje de StrictMode)', async () => {
    const storage = createMemoryTokenStorage()
    const client = createSolvorxClient({ ...baseOptions, storage })

    window.history.pushState({}, '', '/start')
    await client.login({ returnTo: '/dashboard' })
    const txn = JSON.parse(sessionStorage.getItem('sx_txn') ?? 'null')

    let resolveExchange!: (value: endpoints.TokenResponse) => void
    exchangeCodeMock.mockReturnValue(
      new Promise((resolve) => {
        resolveExchange = resolve
      }),
    )
    userinfoMock.mockResolvedValue(fakeUser())

    window.history.pushState({}, '', `/callback?code=abc123&state=${txn.state}`)

    const first = client.init()
    const second = client.init()

    // Para cuando `second` se crea, `first` ya corrió de forma sincrónica
    // hasta pedir el canje -incluida la limpieza de la URL con
    // `replaceState`-, así que `second` no encuentra código que canjear y
    // resuelve unauthenticated sin lanzar. El único canje es el de `first`.
    await expect(second).resolves.toBeUndefined()
    expect(exchangeCodeMock).toHaveBeenCalledTimes(1)

    resolveExchange({ access_token: 'access-1', token_type: 'Bearer', expires_in: 600, refresh_token: 'refresh-1' })
    await expect(first).resolves.toBeUndefined()

    // El resultado final lo pone la primera, que es la que de verdad canjeó.
    expect(exchangeCodeMock).toHaveBeenCalledTimes(1)
    expect(client.getStatus()).toBe('authenticated')
  })

  it('propaga un error de OAuth (?error=access_denied) en vez de tragárselo', async () => {
    const client = createSolvorxClient({ ...baseOptions, storage: createMemoryTokenStorage() })

    window.history.pushState({}, '', '/callback?error=access_denied&error_description=denegado')

    await expect(client.init()).rejects.toMatchObject({ code: 'access_denied' })
    expect(client.getStatus()).toBe('unauthenticated')
  })
})

describe('getAccessToken', () => {
  it('lanza SolvorxError/noSession si no hay sesión', async () => {
    const client = createSolvorxClient({ ...baseOptions, storage: createMemoryTokenStorage() })
    await client.init()

    const error = await client.getAccessToken().catch((e: unknown) => e)
    expect(isSessionMissing(error)).toBe(true)
  })
})

describe('logout', () => {
  it('revoca el access token, intenta el logout de SSO, y limpia el estado local', async () => {
    const storage = createMemoryTokenStorage()
    storage.setRefreshToken('stored-refresh')
    refreshTokensMock.mockResolvedValue({
      access_token: 'access-1',
      token_type: 'Bearer',
      expires_in: 600,
      refresh_token: 'refresh-2',
    })
    userinfoMock.mockResolvedValue(fakeUser())

    const client = createSolvorxClient({ ...baseOptions, storage })
    await client.init()
    expect(client.getStatus()).toBe('authenticated')

    await client.logout()

    expect(revokeTokenMock).toHaveBeenCalledWith('http://localhost:9000', 'sx-console-web', 'access-1')
    expect(ssoLogoutMock).toHaveBeenCalledWith('http://localhost:9000')
    expect(client.getStatus()).toBe('unauthenticated')
    expect(client.currentUser()).toBeNull()
    expect(storage.getRefreshToken()).toBeNull()
  })

  it('limpia el estado local aunque el logout de SSO falle (best-effort)', async () => {
    const storage = createMemoryTokenStorage()
    storage.setRefreshToken('stored-refresh')
    refreshTokensMock.mockResolvedValue({
      access_token: 'access-1',
      token_type: 'Bearer',
      expires_in: 600,
      refresh_token: 'refresh-2',
    })
    userinfoMock.mockResolvedValue(fakeUser())
    ssoLogoutMock.mockRejectedValue(new Error('cross-site, la cookie no viajó'))

    const client = createSolvorxClient({ ...baseOptions, storage })
    await client.init()

    await expect(client.logout()).resolves.toBeUndefined()
    expect(client.getStatus()).toBe('unauthenticated')
  })

  it('con scope "here" revoca el access token pero no toca la sesión SSO', async () => {
    const storage = createMemoryTokenStorage()
    storage.setRefreshToken('stored-refresh')
    refreshTokensMock.mockResolvedValue({
      access_token: 'access-1',
      token_type: 'Bearer',
      expires_in: 600,
      refresh_token: 'refresh-2',
    })
    userinfoMock.mockResolvedValue(fakeUser())

    const client = createSolvorxClient({ ...baseOptions, storage })
    await client.init()

    await client.logout({ scope: 'here' })

    expect(revokeTokenMock).toHaveBeenCalledWith('http://localhost:9000', 'sx-console-web', 'access-1')
    expect(ssoLogoutMock).not.toHaveBeenCalled()
    expect(client.getStatus()).toBe('unauthenticated')
  })
})
