import { requestRaw } from '../http/request'

/**
 * Authorization server: `/v1/public/oauth/*`.
 *
 * Todos los bodies van como `application/x-www-form-urlencoded` y con los
 * nombres en snake_case, que es lo que fija OAuth 2.0. Nunca se manda
 * `client_secret`: este paquete es para clientes **públicos**
 * (`oauth-client.service.ts` del backend rechaza con `invalid_client` a
 * cualquier cliente público que presente uno). La garantía acá es PKCE.
 */

const OAUTH_PATH = '/v1/public/oauth'
const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' }

export interface TokenResponse {
  access_token: string
  token_type: string
  /** Segundos de vida del access token. Fuente de verdad del TTL: nunca asumir un valor fijo. */
  expires_in: number
  /** Rotativo: el backend lo reemplaza en cada uso. */
  refresh_token?: string
  id_token?: string
  scope?: string
}

/** Perfil OIDC estándar del titular del token. */
export interface UserInfo {
  sub: string
  name: string
  preferred_username: string
  email: string
  email_verified: boolean
  phone_number?: string
  phone_number_verified: boolean
  picture?: string
  project: { id: number; code: string; name: string }
  permissions: string[]
}

function form(fields: Record<string, string>): URLSearchParams {
  return new URLSearchParams(fields)
}

/**
 * URL de `/authorize`. El backend responde siempre con un 302 -a la
 * `redirectUri` si ya hay cookie SSO, o al frontend de login si no-, por eso
 * esto es una navegación top-level (`location.assign`) y no un `fetch`.
 */
export function buildAuthorizeUrl(
  issuer: string,
  params: {
    clientId: string
    redirectUri: string
    scopes: string[]
    state: string
    codeChallenge: string
    /** `'login'` fuerza reautenticación aunque haya sesión SSO abierta. */
    prompt?: 'login'
  },
): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: params.scopes.join(' '),
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    ...(params.prompt ? { prompt: params.prompt } : {}),
  })

  return `${issuer}${OAUTH_PATH}/authorize?${query.toString()}`
}

/**
 * Canje del código por tokens.
 *
 * `redirectUri` va de nuevo y tiene que ser **idéntica**, byte a byte, a la
 * que se mandó en `/authorize`: el backend la compara contra la que guardó
 * junto al código. El código vale ~60 segundos y es de un solo uso.
 */
export function exchangeCode(
  issuer: string,
  params: { clientId: string; redirectUri: string; code: string; codeVerifier: string },
): Promise<TokenResponse> {
  return requestRaw<TokenResponse>(`${issuer}${OAUTH_PATH}/token`, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({
      grant_type: 'authorization_code',
      client_id: params.clientId,
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    }),
  })
}

/**
 * Renovación con `grant_type=refresh_token`.
 *
 * El refresh **rota**: la respuesta trae uno nuevo y el anterior queda
 * inservible. Reusar uno ya rotado no falla solo este request -el backend lo
 * trata como robo de token (`REUSE_ATTACK`) y revoca la sesión entera-, por
 * eso el único llamador de esta función es `session/refresh.ts`, siempre
 * bajo el lock. No llamarla directo desde ningún otro lugar del paquete.
 */
export function refreshTokens(issuer: string, clientId: string, refreshToken: string): Promise<TokenResponse> {
  return requestRaw<TokenResponse>(`${issuer}${OAUTH_PATH}/token`, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }),
  })
}

/**
 * Revoca un token (RFC 7009). Responde 200 aunque el token no sirva, para no
 * revelar su validez -así que el éxito de esta llamada no confirma nada-.
 *
 * **Solo acepta access tokens.** El backend decodifica y exige `tType ===
 * 'access'`; mandarle acá el refresh token es un no-op silencioso que deja
 * la sesión de proyecto viva.
 */
export async function revokeToken(issuer: string, clientId: string, accessToken: string): Promise<void> {
  await requestRaw<Record<string, never>>(`${issuer}${OAUTH_PATH}/revoke`, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ token: accessToken, client_id: clientId }),
  })
}

/** Perfil OIDC estándar del titular del access token. */
export function userinfo(issuer: string, accessToken: string): Promise<UserInfo> {
  return requestRaw<UserInfo>(`${issuer}${OAUTH_PATH}/userinfo`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

/**
 * Revoca la `SsoSession` del navegador -y cascadea a todas las sesiones de
 * proyecto que nacieron de ese login-, pero **solo si la cookie `sx_sso`
 * viaja**. Es `SameSite=Lax`: en una app bajo `*.solvorx.com` viaja porque es
 * same-site; en una app de un dominio externo, un `fetch` cross-site no la
 * manda y este POST llega sin cookie y no revoca nada. Es la limitación
 * documentada en el README -el arreglo es un `GET` con
 * `post_logout_redirect_uri`, que es trabajo de backend fuera de este plan.
 */
export async function ssoLogout(issuer: string): Promise<void> {
  await requestRaw<Record<string, boolean>>(`${issuer}${OAUTH_PATH}/logout`, {
    method: 'POST',
    credentials: 'include',
  })
}
