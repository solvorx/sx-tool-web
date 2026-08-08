/**
 * Transacción PKCE: el puente entre `login()` y `init()` resolviendo el
 * callback. Análogo a `sx-account-web/src/lib/auth/transaction.server.ts`,
 * pero en `sessionStorage` en vez de una cookie httpOnly -acá no hay servidor
 * que ponga cookies, y no hace falta: nada de esto es secreto de otra
 * cuenta, en el peor caso alguien fuerza un `state` que no matchea y el login
 * se reinicia.
 *
 * `sessionStorage` y no `localStorage`: la transacción vive ~60 segundos y es
 * por pestaña -si sobreviviera a cerrar la pestaña no habría con qué
 * consumirla-.
 */

const TXN_KEY = 'sx_txn'

export interface AuthTransaction {
  state: string
  codeVerifier: string
  /** Path relativo saneado a donde volver tras el login. */
  returnTo: string
}

export function saveTransaction(txn: AuthTransaction): void {
  sessionStorage.setItem(TXN_KEY, JSON.stringify(txn))
}

/** Lee y borra la transacción. Es de un solo uso: un callback no se procesa dos veces. */
export function consumeTransaction(): AuthTransaction | null {
  const raw = sessionStorage.getItem(TXN_KEY)
  sessionStorage.removeItem(TXN_KEY)
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const candidate = parsed as Record<string, unknown>
    if (
      typeof candidate.state !== 'string' ||
      typeof candidate.codeVerifier !== 'string' ||
      typeof candidate.returnTo !== 'string'
    ) {
      return null
    }

    return { state: candidate.state, codeVerifier: candidate.codeVerifier, returnTo: candidate.returnTo }
  } catch {
    return null
  }
}

/**
 * Sanea el `returnTo` que se guarda al llamar `login()`.
 *
 * El destino siempre es una ruta interna de esta misma app -nunca hay que
 * salir del origin-, así que el filtro es más estricto que validar contra un
 * allowlist de protocolo: tiene que ser un path relativo.
 *
 * Rechaza `//evil.com` (protocol-relative, el navegador lo trata como
 * absoluta), cualquier URL con esquema, y cualquier cosa que no arranque con
 * un solo `/`.
 */
export function sanitizeReturnTo(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback

  try {
    const resolved = new URL(raw, 'http://internal.invalid')
    if (resolved.origin !== 'http://internal.invalid') return fallback
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return fallback
  }
}
