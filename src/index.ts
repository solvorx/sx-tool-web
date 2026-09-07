/**
 * Única superficie pública del paquete. Todo lo que una app integradora
 * necesita se importa de acá -nada de `@solvorx/sx-tool-web/oauth/pkce` ni
 * rutas internas, que quedan libres de reorganizar sin romper a nadie.
 */

export { createSolvorxBffClient, createSolvorxClient, getDefaultClient, setDefaultClient } from './core/client'
export type {
  LoginOptions,
  LogoutOptions,
  SolvorxBffClientOptions,
  SolvorxClient,
  SolvorxSessionSource,
} from './core/client'
export type { AuthStatus, SessionUser, StateListener } from './core/state'

export type { ResolvedOptions, SolvorxClientOptions, StorageMode } from './config/options'

export {
  createLocalStorageTokenStorage,
  createMemoryTokenStorage,
  createSessionStorageTokenStorage,
} from './session/token-store'
export type { TokenStorage } from './session/token-store'

export {
  CLIENT_ERROR_CODE,
  SolvorxError,
  isForbidden,
  isRateLimited,
  isSessionMissing,
  isUnauthorized,
} from './http/error'
export type { ClientErrorCode } from './http/error'

export type { TokenResponse, UserInfo } from './oauth/endpoints'
export { readAccessTokenClaims } from './oauth/claims'
export type { AccessTokenClaims } from './oauth/claims'

export { SxLoginButton } from './ui/login-button'
export { SxUserMenu, mountUserMenu } from './ui/user-menu'
export type {
  MountUserMenuOptions,
  SxTheme,
  UserMenuLabels,
  UserMenuOptions,
  UserMenuThemeLabels,
  UserMenuThemeOptions,
} from './ui/user-menu'

export { COUNTRIES, DEFAULT_COUNTRY_ISO2, DIAL_CODES_BY_LENGTH } from './ui/phone-countries'
export type { Country } from './ui/phone-countries'
export { PHONE_MAX_LENGTH, dialCodeOf, findCountry, joinPhoneNumber, splitPhoneNumber } from './ui/phone-format'
export type { SplitPhone } from './ui/phone-format'

import { SxLoginButton } from './ui/login-button'
import { SxUserMenu } from './ui/user-menu'

/**
 * Registra `<sx-login-button>` y `<sx-user-menu>` como Custom Elements.
 *
 * No se ejecuta sola al importar el paquete -el paquete es `sideEffects:
 * false`, y `customElements` ni existe en un render de servidor-. Se llama
 * una vez, del lado del navegador, antes de montar markup con esos tags.
 * Quien prefiera no registrar elementos globales tiene `mountUserMenu()`.
 *
 * **Llamar siempre después de `createSolvorxClient()`, nunca antes.** Si el
 * markup ya está en el HTML -el caso típico en JS plano, sin framework-,
 * definir el Custom Element lo "upgradea" ahí mismo, sincrónico, y su
 * `connectedCallback` busca `getDefaultClient()` en ese instante. Si todavía
 * no se llamó a `createSolvorxClient()`, se bindea a `null` y el componente
 * queda oculto para siempre -`connectedCallback` no se vuelve a disparar
 * solo, así que no hay una segunda oportunidad de bindear el cliente real-.
 */
export function registerSolvorxElements(): void {
  if (typeof customElements === 'undefined') return

  if (!customElements.get('sx-login-button')) customElements.define('sx-login-button', SxLoginButton)
  if (!customElements.get('sx-user-menu')) customElements.define('sx-user-menu', SxUserMenu)
}
