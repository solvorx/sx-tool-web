/**
 * Persistencia del refresh token. El access token **nunca** pasa por acá:
 * vive en memoria del cliente (`core/client.ts`), nunca en storage ni en
 * cookie -ver el porqué en el README, sección "Dónde viven los tokens".
 *
 * Namespaced por `clientId`: dos `createSolvorxClient()` con distinto cliente
 * en el mismo origen (por ejemplo, dos widgets embebidos) no se pisan el
 * refresh token.
 */
export interface TokenStorage {
  getRefreshToken(): string | null
  setRefreshToken(token: string | null): void
}

function keyFor(namespace: string): string {
  return `sx:${namespace}:refresh_token`
}

function fromWebStorage(storage: Storage, namespace: string): TokenStorage {
  const key = keyFor(namespace)
  return {
    getRefreshToken: () => storage.getItem(key),
    setRefreshToken: (token) => {
      if (token) storage.setItem(key, token)
      else storage.removeItem(key)
    },
  }
}

/** Sobrevive a recargas y a cerrar la pestaña. Es el default: ver el porqué en el README. */
export function createLocalStorageTokenStorage(namespace: string): TokenStorage {
  return fromWebStorage(localStorage, namespace)
}

/** Una sesión de proyecto por pestaña. Documentado como opción, no como default: ver el README. */
export function createSessionStorageTokenStorage(namespace: string): TokenStorage {
  return fromWebStorage(sessionStorage, namespace)
}

/** No sobrevive ni a un refresh de página. Útil para tests o para no persistir nada. */
export function createMemoryTokenStorage(): TokenStorage {
  let token: string | null = null
  return {
    getRefreshToken: () => token,
    setRefreshToken: (value) => {
      token = value
    },
  }
}
