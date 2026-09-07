/**
 * Superficie de servidor. Para apps con backend propio -un BFF que guarda el
 * refresh token server-side, como `sx-account-web`- que necesitan autenticar
 * como cliente OAuth **confidencial** (`client_secret` en `/token` y
 * `/revoke`).
 *
 * No toca DOM, ni storage, ni cookies: eso es asunto de cada app (Redis,
 * `__Host-*`, lo que sea). Este módulo solo arma URLs y llama a
 * `/v1/public/oauth/*`, igual que el barril de navegador pero con
 * `clientSecret` disponible.
 *
 * **Invariante:** `SolvorxServerClientOptions` es la única forma de pasar un
 * `client_secret` en todo el paquete. `SolvorxClientOptions` (barril de
 * navegador, `../config/options.ts`) no tiene ese campo -es lo que hace
 * estructuralmente imposible que el secreto llegue a un bundle de cliente.
 */
import {
  buildAuthorizeUrl,
  exchangeCode,
  refreshTokens,
  revokeToken,
  ssoLogout,
  userinfo,
  type TokenResponse,
  type UserInfo,
} from '../oauth/endpoints'

export interface SolvorxServerClientOptions {
  /** Base del Authorization Server, sin slash final, p. ej. `https://auth.solvorx.com`. */
  issuer: string
  /** `client_id` del cliente OAuth confidencial, registrado del lado de SXMS. */
  clientId: string
  /** Solo para clientes confidenciales. Nunca debe llegar al bundle del navegador. */
  clientSecret?: string
  /** Debe coincidir byte a byte con una `redirect_uri` registrada en el cliente. */
  redirectUri: string
  /** Default: `['openid', 'profile', 'email']`. */
  scopes?: string[]
}

export interface SolvorxServerClient {
  /** URL de `/authorize`. Redirigir top-level -nunca `fetch`-, igual que en el barril de navegador. */
  buildAuthorizeUrl(params: { state: string; codeChallenge: string; prompt?: 'login' }): string
  /** Canje del código por tokens, con `client_secret` si el cliente lo tiene configurado. */
  exchangeCode(params: { code: string; codeVerifier: string }): Promise<TokenResponse>
  /** Renovación con `grant_type=refresh_token`. Serializar del lado de quien llama -acá no hay lock. */
  refreshTokens(refreshToken: string): Promise<TokenResponse>
  /** Revoca un access token (RFC 7009). */
  revokeToken(token: string): Promise<void>
  /** Perfil OIDC estándar del titular del access token. */
  userinfo(accessToken: string): Promise<UserInfo>
  /**
   * Cierra la sesión SSO del navegador y, en cascada, todas las sesiones de
   * proyecto que nacieron de ese login. Se identifica con el access token.
   *
   * Server-to-server a propósito. Hacerlo desde el navegador obliga a que la
   * cookie `sx_sso_<org>` viaje, y no viaja si la app y el Authorization
   * Server no comparten sitio -`*.account.localhost` contra `localhost` en
   * dev-; además obliga a saber en qué organización está la sesión. Con el
   * token, el backend deduce las dos cosas de la sesión que el token nombra.
   */
  ssoLogout(accessToken: string): Promise<void>
}

const DEFAULT_SCOPES = ['openid', 'profile', 'email']

export function createSolvorxServerClient(options: SolvorxServerClientOptions): SolvorxServerClient {
  if (!options.issuer) throw new Error('createSolvorxServerClient: falta "issuer".')
  if (!options.clientId) throw new Error('createSolvorxServerClient: falta "clientId".')
  if (!options.redirectUri) throw new Error('createSolvorxServerClient: falta "redirectUri".')

  const issuer = options.issuer.replace(/\/+$/, '')
  const { clientId, clientSecret, redirectUri } = options
  const scopes = options.scopes ?? DEFAULT_SCOPES

  return {
    buildAuthorizeUrl: (params) =>
      buildAuthorizeUrl(issuer, {
        clientId,
        redirectUri,
        scopes,
        state: params.state,
        codeChallenge: params.codeChallenge,
        ...(params.prompt ? { prompt: params.prompt } : {}),
      }),

    exchangeCode: (params) =>
      exchangeCode(issuer, {
        clientId,
        clientSecret,
        redirectUri,
        code: params.code,
        codeVerifier: params.codeVerifier,
      }),

    refreshTokens: (refreshToken) => refreshTokens(issuer, clientId, refreshToken, clientSecret),

    revokeToken: (token) => revokeToken(issuer, clientId, token, clientSecret),

    userinfo: (accessToken) => userinfo(issuer, accessToken),

    ssoLogout: (accessToken) => ssoLogout(issuer, clientId, { accessToken }),
  }
}

export { createCodeVerifier, createState, deriveCodeChallenge } from '../oauth/pkce'
export { sanitizeReturnTo } from '../oauth/transaction'
export { readAccessTokenClaims } from '../oauth/claims'
export type { AccessTokenClaims } from '../oauth/claims'
export {
  CLIENT_ERROR_CODE,
  SolvorxError,
  isForbidden,
  isRateLimited,
  isSessionMissing,
  isUnauthorized,
} from '../http/error'
export type { ClientErrorCode } from '../http/error'
export type { TokenResponse, UserInfo } from '../oauth/endpoints'
export { isRevokedSessionError, withSessionRecovery } from './session-recovery'
