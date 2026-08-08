import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_ERROR_CODE, SolvorxError } from '../http/error'
import * as endpoints from '../oauth/endpoints'
import { createRefreshCoordinator } from './refresh'
import { createMemoryTokenStorage } from './token-store'

vi.mock('../oauth/endpoints', () => ({
  refreshTokens: vi.fn(),
}))

const refreshTokensMock = vi.mocked(endpoints.refreshTokens)

beforeEach(() => {
  refreshTokensMock.mockReset()
})

describe('createRefreshCoordinator · serialización del refresh', () => {
  /**
   * El test más importante del paquete: si esto falla, dos pestañas -o dos
   * llamadas concurrentes en la misma- rotan el refresh token dos veces y el
   * backend trata la segunda como `REUSE_ATTACK`, revocando la sesión entera.
   */
  it('dos llamadas concurrentes con el token vencido disparan un solo POST a /token', async () => {
    const storage = createMemoryTokenStorage()
    storage.setRefreshToken('refresh-1')

    let resolveRefresh!: (value: endpoints.TokenResponse) => void
    const pending = new Promise<endpoints.TokenResponse>((resolve) => {
      resolveRefresh = resolve
    })
    refreshTokensMock.mockReturnValue(pending)

    const coordinator = createRefreshCoordinator({
      issuer: 'http://localhost:9000',
      clientId: 'sx-console-web',
      storage,
    })

    const call1 = coordinator.getAccessToken()
    const call2 = coordinator.getAccessToken()

    // Ambas llamadas llegan hasta pedir el token nuevo; solo una debería
    // haber alcanzado a llamar a la red -la otra queda encolada en el lock.
    await vi.waitFor(() => expect(refreshTokensMock).toHaveBeenCalledTimes(1))
    expect(refreshTokensMock).toHaveBeenCalledWith('http://localhost:9000', 'sx-console-web', 'refresh-1')

    resolveRefresh({
      access_token: 'access-new',
      token_type: 'Bearer',
      expires_in: 600,
      refresh_token: 'refresh-2',
    })

    const [token1, token2] = await Promise.all([call1, call2])

    expect(token1).toBe('access-new')
    expect(token2).toBe('access-new')
    expect(refreshTokensMock).toHaveBeenCalledTimes(1)
    expect(storage.getRefreshToken()).toBe('refresh-2')
  })

  it('no llama a la red si el access token en memoria todavía no está por vencer', async () => {
    const storage = createMemoryTokenStorage()
    const coordinator = createRefreshCoordinator({ issuer: 'x', clientId: 'c', storage })
    coordinator.setAccessToken({ accessToken: 'still-fresh', expiresAt: Date.now() + 5 * 60_000 })

    await expect(coordinator.getAccessToken()).resolves.toBe('still-fresh')
    expect(refreshTokensMock).not.toHaveBeenCalled()
  })

  it('renueva si el access token en memoria está dentro del margen de vencimiento', async () => {
    const storage = createMemoryTokenStorage()
    storage.setRefreshToken('refresh-1')
    refreshTokensMock.mockResolvedValue({
      access_token: 'access-renewed',
      token_type: 'Bearer',
      expires_in: 600,
      refresh_token: 'refresh-2',
    })

    const coordinator = createRefreshCoordinator({ issuer: 'x', clientId: 'c', storage, skewMs: 60_000 })
    // A 30s de vencer, dentro del margen de 60s.
    coordinator.setAccessToken({ accessToken: 'about-to-expire', expiresAt: Date.now() + 30_000 })

    await expect(coordinator.getAccessToken()).resolves.toBe('access-renewed')
    expect(refreshTokensMock).toHaveBeenCalledTimes(1)
  })

  it('rechaza con SolvorxError/noSession si no hay refresh token guardado', async () => {
    const storage = createMemoryTokenStorage()
    const coordinator = createRefreshCoordinator({ issuer: 'x', clientId: 'c', storage })

    await expect(coordinator.getAccessToken()).rejects.toMatchObject({
      code: CLIENT_ERROR_CODE.noSession,
    })
    expect(refreshTokensMock).not.toHaveBeenCalled()
  })

  it('limpia storage y el caché en memoria si el refresh token ya no sirve', async () => {
    const storage = createMemoryTokenStorage()
    storage.setRefreshToken('refresh-dead')
    refreshTokensMock.mockRejectedValue(
      new SolvorxError({ message: 'El código ya se usó o venció', code: 'invalid_grant', status: 400 }),
    )

    const coordinator = createRefreshCoordinator({ issuer: 'x', clientId: 'c', storage })

    const error = await coordinator.getAccessToken().catch((e: unknown) => e)

    // El código se normaliza a noSession -invalid_grant, revocado o reusado
    // son la misma situación para quien llama: no hay sesión utilizable-,
    // pero el mensaje original se conserva para debugging.
    expect(error).toMatchObject({ code: CLIENT_ERROR_CODE.noSession })
    expect((error as SolvorxError).message).toBe('El código ya se usó o venció')
    expect(storage.getRefreshToken()).toBeNull()
    expect(coordinator.getCurrent()).toBeNull()
  })

  it('no reclasifica un fallo de red (sin respuesta del servidor) como noSession', async () => {
    const storage = createMemoryTokenStorage()
    storage.setRefreshToken('refresh-1')
    refreshTokensMock.mockRejectedValue(
      new SolvorxError({ message: 'No se pudo conectar con el servidor.', code: CLIENT_ERROR_CODE.network }),
    )

    const coordinator = createRefreshCoordinator({ issuer: 'x', clientId: 'c', storage })

    const error = await coordinator.getAccessToken().catch((e: unknown) => e)

    expect(error).toMatchObject({ code: CLIENT_ERROR_CODE.network })
  })
})
