import {
  createLocalStorageTokenStorage,
  createMemoryTokenStorage,
  createSessionStorageTokenStorage,
  type TokenStorage,
} from '../session/token-store'

export type StorageMode = 'localStorage' | 'sessionStorage' | 'memory'

export interface SolvorxClientOptions {
  /** Base del Authorization Server, sin slash final, p. ej. `https://auth.solvorx.com`. */
  issuer: string
  /** `client_id` del cliente OAuth público, registrado del lado de SXMS. */
  clientId: string
  /** Debe coincidir byte a byte con una `redirect_uri` registrada en el cliente. */
  redirectUri: string
  /** Default: `['openid', 'profile', 'email']`. */
  scopes?: string[]
  /** Destino del botón "Mi cuenta". Default: `https://account.solvorx.com`. */
  accountUrl?: string
  /**
   * Dónde persiste el refresh token. Default: `'localStorage'`.
   *
   * `'sessionStorage'` abre una `Session` de proyecto nueva por pestaña -el
   * tope es 5 por usuario+proyecto, y la sexta revoca la más vieja-.
   * `'memory'` no sobrevive ni a un refresh de página. Para pasar una
   * implementación propia, ver la interfaz `TokenStorage`.
   */
  storage?: StorageMode | TokenStorage
}

export interface ResolvedOptions {
  issuer: string
  clientId: string
  redirectUri: string
  scopes: string[]
  accountUrl: string
  storage: TokenStorage
}

const DEFAULT_SCOPES = ['openid', 'profile', 'email']
const DEFAULT_ACCOUNT_URL = 'https://account.solvorx.com'

function isTokenStorage(value: unknown): value is TokenStorage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.getRefreshToken === 'function' && typeof candidate.setRefreshToken === 'function'
}

function resolveStorage(storage: StorageMode | TokenStorage | undefined, clientId: string): TokenStorage {
  if (isTokenStorage(storage)) return storage

  switch (storage ?? 'localStorage') {
    case 'localStorage':
      return createLocalStorageTokenStorage(clientId)
    case 'sessionStorage':
      return createSessionStorageTokenStorage(clientId)
    case 'memory':
      return createMemoryTokenStorage()
  }
}

export function resolveOptions(options: SolvorxClientOptions): ResolvedOptions {
  if (!options.issuer) throw new Error('createSolvorxClient: falta "issuer".')
  if (!options.clientId) throw new Error('createSolvorxClient: falta "clientId".')
  if (!options.redirectUri) throw new Error('createSolvorxClient: falta "redirectUri".')

  return {
    // Sin slash final: `endpoints.ts` arma las URLs concatenando el path a mano.
    issuer: options.issuer.replace(/\/+$/, ''),
    clientId: options.clientId,
    redirectUri: options.redirectUri,
    scopes: options.scopes ?? DEFAULT_SCOPES,
    accountUrl: options.accountUrl ?? DEFAULT_ACCOUNT_URL,
    storage: resolveStorage(options.storage, options.clientId),
  }
}
