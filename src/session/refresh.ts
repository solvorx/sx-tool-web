import { refreshTokens } from '../oauth/endpoints'
import { CLIENT_ERROR_CODE, SolvorxError } from '../http/error'
import type { TokenStorage } from './token-store'

/**
 * Renovación del access token, serializada con `navigator.locks`.
 *
 * Es el análogo en el navegador del lock de Redis de
 * `sx-account-web/src/lib/auth/session-store.server.ts`: el refresh token
 * **rota** en cada uso, y dos renovaciones concurrentes con el mismo token
 * rotado disparan `REUSE_ATTACK` del lado del backend, que revoca la sesión
 * entera. Sin este lock el paquete desloguea gente al azar.
 *
 * `navigator.locks` no es un mutex de esta pestaña: la Web Locks API está
 * scopeada por origen y la comparten todas las pestañas, workers e iframes
 * de ese origen. Eso es lo que la hace comparable al lock de Redis -que
 * serializa entre *procesos* del servidor- y no un simple mutex en memoria,
 * que solo protegería contra llamadas concurrentes de esta misma pestaña.
 *
 * Lo que el lock de origen NO comparte es el caché en memoria (`current`):
 * cada pestaña tiene el suyo. Por eso, adentro del lock, se relee el refresh
 * token de `storage` -que si otra pestaña ya rotó, ya tiene el valor
 * nuevo- en vez de confiar en lo que esta pestaña tenía guardado. Eso evita
 * el `REUSE_ATTACK`, aunque no evita una renovación de más entre pestañas: a
 * eso apunta `session/sync.ts`, que le avisa a las otras pestañas el
 * resultado de un refresh para que actualicen su propio `current` y no
 * tengan que pedir uno.
 */

/** Igual que `REFRESH_SKEW_MS` en `sx-account-web/src/lib/auth/require-session.server.ts`. */
const DEFAULT_SKEW_MS = 60_000

export interface AccessToken {
  accessToken: string
  /** Epoch ms. */
  expiresAt: number
}

export interface RefreshCoordinatorDeps {
  issuer: string
  clientId: string
  storage: TokenStorage
  /** Margen antes del vencimiento para considerar que ya conviene renovar. */
  skewMs?: number
}

export interface RefreshCoordinator {
  /** Token válido: del caché en memoria si no está por vencer, o renovado bajo lock. */
  getAccessToken(): Promise<string>
  /** El caché en memoria tal cual, sin disparar una renovación. */
  getCurrent(): AccessToken | null
  /** Escribe el caché en memoria directamente -lo usa `init()` tras el canje, y `session/sync.ts` al recibir el aviso de otra pestaña. */
  setAccessToken(token: AccessToken | null): void
  /** Limpia el caché en memoria. No toca `storage`: de eso se encarga quien orquesta el logout. */
  clear(): void
}

export function createRefreshCoordinator(deps: RefreshCoordinatorDeps): RefreshCoordinator {
  const skewMs = deps.skewMs ?? DEFAULT_SKEW_MS
  const lockName = `sx-refresh:${deps.clientId}`
  let current: AccessToken | null = null

  function isFresh(token: AccessToken | null): token is AccessToken {
    return token !== null && token.expiresAt - Date.now() > skewMs
  }

  async function getAccessToken(): Promise<string> {
    if (isFresh(current)) return current.accessToken

    return navigator.locks.request(lockName, async () => {
      // Doble chequeo: mientras esperábamos el lock, otra llamada de esta
      // misma pestaña (encolada detrás del mismo nombre) ya pudo renovar.
      if (isFresh(current)) return current.accessToken

      const refreshToken = deps.storage.getRefreshToken()
      if (!refreshToken) {
        throw new SolvorxError({
          message: 'No hay una sesión activa.',
          code: CLIENT_ERROR_CODE.noSession,
        })
      }

      try {
        const response = await refreshTokens(deps.issuer, deps.clientId, refreshToken)
        current = { accessToken: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 }
        deps.storage.setRefreshToken(response.refresh_token ?? null)
        return current.accessToken
      } catch (error) {
        // El refresh token que teníamos ya no sirve -vencido, revocado, o
        // rotado y reusado-. Limpiar para no reintentar con uno muerto.
        current = null
        deps.storage.setRefreshToken(null)

        // El servidor SÍ respondió (status > 0): sea `invalid_grant` por
        // vencido, revocado o reusado, o cualquier otro rechazo del grant,
        // para quien llama a `getAccessToken()` es la misma situación -no hay
        // sesión utilizable-, y se normaliza a un único código para que no
        // haga falta conocer cada variante de OAuth para reaccionar bien. Un
        // fallo sin respuesta (red caída, `client/network` con `status: 0`)
        // no es esto: ahí no sabemos si la sesión sigue viva o no, y hay que
        // dejar que el error real llegue a quien llama.
        if (SolvorxError.is(error) && error.status > 0) {
          throw new SolvorxError({
            message: error.message,
            code: CLIENT_ERROR_CODE.noSession,
            traceId: error.traceId,
            status: error.status,
          })
        }

        throw error
      }
    })
  }

  return {
    getAccessToken,
    getCurrent: () => current,
    setAccessToken: (token) => {
      current = token
    },
    clear: () => {
      current = null
    },
  }
}
