import { resolveOptions, type SolvorxClientOptions } from '../config/options'
import { CLIENT_ERROR_CODE, SolvorxError, isSessionMissing, isUnauthorized } from '../http/error'
import { buildAuthorizeUrl, exchangeCode, revokeToken, ssoLogout, userinfo, type UserInfo } from '../oauth/endpoints'
import { createCodeVerifier, createState, deriveCodeChallenge } from '../oauth/pkce'
import { consumeTransaction, sanitizeReturnTo, saveTransaction } from '../oauth/transaction'
import { createRefreshCoordinator } from '../session/refresh'
import { createBroadcastSessionWatcher } from '../session/sync'
import { createStore, type AuthStatus, type StateListener } from './state'

export interface LoginOptions {
  /** Path relativo a donde volver tras el login. Default: la URL actual. */
  returnTo?: string
  /** Fuerza reautenticación aunque haya una sesión SSO abierta. */
  prompt?: 'login'
}

export interface SolvorxClient {
  /**
   * Único punto de entrada asíncrono. Si la URL trae `code`+`state`, resuelve
   * el callback; si no, rehidrata desde el refresh token guardado; si no hay
   * ninguno, queda `unauthenticated`. Llamarla una vez al arrancar la app.
   */
  init(): Promise<void>
  /** Redirect top-level a `/authorize`. No hace falta `await`: la navegación corta la ejecución -pero es awaitable, por si hace falta esperar a que la URL esté armada, como en los tests. */
  login(options?: LoginOptions): Promise<void>
  /** El usuario autenticado, o `null`. Sincrónico: lee del estado ya resuelto por `init()`. */
  currentUser(): UserInfo | null
  /** `'loading'` antes de que `init()` resuelva. */
  getStatus(): AuthStatus
  /** Token vigente; renueva bajo lock si hace falta. Lanza `SolvorxError` con `code: 'client/no-session'` si no hay sesión. */
  getAccessToken(): Promise<string>
  logout(): Promise<void>
  subscribe(listener: StateListener): () => void
  /** Destino resuelto del botón "Mi cuenta". */
  readonly accountUrl: string
}

export function createSolvorxClient(options: SolvorxClientOptions): SolvorxClient {
  const config = resolveOptions(options)
  const refresh = createRefreshCoordinator({
    issuer: config.issuer,
    clientId: config.clientId,
    storage: config.storage,
  })
  const watcher = createBroadcastSessionWatcher(config.clientId)
  const store = createStore({ status: 'loading', user: null })

  // Lo que otra pestaña de esta misma app avisa: no disparar un refresh
  // propio si ya hay un token fresco, y no quedarse mostrando una sesión
  // muerta si la otra pestaña cerró sesión.
  watcher.subscribe((message) => {
    if (message.type === 'access-token-updated') {
      refresh.setAccessToken({ accessToken: message.accessToken, expiresAt: message.expiresAt })
      return
    }

    refresh.clear()
    store.setState({ status: 'unauthenticated', user: null })
  })

  /** Envuelve `refresh.getAccessToken()` para avisar a otras pestañas solo cuando de verdad hubo una renovación. */
  async function getAccessToken(): Promise<string> {
    const before = refresh.getCurrent()
    const token = await refresh.getAccessToken()
    const after = refresh.getCurrent()

    if (after && after !== before) {
      watcher.notify({ type: 'access-token-updated', accessToken: after.accessToken, expiresAt: after.expiresAt })
    }

    return token
  }

  /**
   * Resuelve `code`+`state` en la URL actual, si los hay.
   *
   * Todo lo que pasa antes del primer `await` -consumir la transacción y
   * limpiar la URL con `replaceState`- es sincrónico. Eso es lo que protege
   * contra el doble montaje de efectos de StrictMode: si `init()` se llama
   * dos veces seguidas, la primera ya sacó `code`/`state` de la URL (y la
   * transacción de `sessionStorage`) antes de que la segunda alcance a
   * mirarlos, así que la segunda simplemente no encuentra un callback que
   * resolver -no hay excepción, ni un segundo canje del código-. El
   * `authenticated` final lo termina poniendo la primera llamada, que es la
   * única que de verdad llegó a canjear.
   */
  async function completeCallback(): Promise<boolean> {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const errorParam = url.searchParams.get('error')

    if (!code && !errorParam) return false

    const txn = consumeTransaction()

    // Si no hay transacción con la que volver a un `returnTo` propio, al
    // menos se limpian los parámetros de OAuth de la URL actual.
    const cleaned = new URL(url)
    for (const param of ['code', 'state', 'error', 'error_description']) cleaned.searchParams.delete(param)
    const fallbackPath = `${cleaned.pathname}${cleaned.search}${cleaned.hash}`

    if (errorParam) {
      window.history.replaceState(null, '', txn?.returnTo ?? sanitizeReturnTo(null, fallbackPath))
      throw new SolvorxError({
        message: url.searchParams.get('error_description') ?? 'El proveedor de identidad rechazó el login.',
        code: errorParam,
      })
    }

    if (!txn) {
      window.history.replaceState(null, '', sanitizeReturnTo(null, fallbackPath))
      throw new SolvorxError({
        message: 'No se encontró la transacción de login: la página se recargó, o el código ya se consumió.',
        code: CLIENT_ERROR_CODE.stateMismatch,
      })
    }

    // Comparar el state ANTES de canjear: es la única defensa contra que
    // alguien inyecte un código ajeno en esta sesión.
    if (txn.state !== returnedState) {
      window.history.replaceState(null, '', txn.returnTo)
      throw new SolvorxError({
        message: 'El "state" del callback no coincide con el guardado: posible CSRF.',
        code: CLIENT_ERROR_CODE.stateMismatch,
      })
    }

    // Limpiar la URL antes de canjear: si el canje falla, no queda un código
    // (de un solo uso, ya inservible) colgando en la barra de direcciones.
    window.history.replaceState(null, '', txn.returnTo)

    // code no puede ser null acá: la guarda `!code && !errorParam` de arriba lo garantiza.
    const tokens = await exchangeCode(config.issuer, {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      code: code as string,
      codeVerifier: txn.codeVerifier,
    })

    refresh.setAccessToken({ accessToken: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 })
    config.storage.setRefreshToken(tokens.refresh_token ?? null)

    return true
  }

  async function init(): Promise<void> {
    store.setState({ status: 'loading' })

    try {
      const cameFromCallback = await completeCallback()

      if (!cameFromCallback && !config.storage.getRefreshToken()) {
        store.setState({ status: 'unauthenticated', user: null })
        return
      }

      const accessToken = await getAccessToken()
      const user = await userinfo(config.issuer, accessToken)
      store.setState({ status: 'authenticated', user })
    } catch (error) {
      refresh.clear()
      config.storage.setRefreshToken(null)
      store.setState({ status: 'unauthenticated', user: null })

      // "No hay sesión" -o un access token que `/userinfo` ya no acepta,
      // recién renovado o no- es un resultado esperado de init(), no una
      // falla: cualquier otra cosa (red caída, state mismatch, error de
      // OAuth) sí se propaga para que la app pueda mostrarla.
      if (!isSessionMissing(error) && !isUnauthorized(error)) throw error
    }
  }

  async function login(loginOptions: LoginOptions = {}): Promise<void> {
    const codeVerifier = createCodeVerifier()
    const state = createState()
    const codeChallenge = await deriveCodeChallenge(codeVerifier)
    const returnTo = sanitizeReturnTo(loginOptions.returnTo, `${window.location.pathname}${window.location.search}`)

    saveTransaction({ state, codeVerifier, returnTo })

    const url = buildAuthorizeUrl(config.issuer, {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      state,
      codeChallenge,
      ...(loginOptions.prompt ? { prompt: loginOptions.prompt } : {}),
    })

    window.location.assign(url)
  }

  async function logout(): Promise<void> {
    const current = refresh.getCurrent()

    // Bearer: siempre funciona, sin importar el dominio de esta app.
    if (current) {
      await revokeToken(config.issuer, config.clientId, current.accessToken).catch(() => null)
    }

    // Cookie de sesión SSO: solo funciona si viaja -mismo site que auth.solvorx.com-.
    // Ver la limitación documentada en el README. Best-effort a propósito.
    await ssoLogout(config.issuer).catch(() => null)

    refresh.clear()
    config.storage.setRefreshToken(null)
    store.setState({ status: 'unauthenticated', user: null })
    watcher.notify({ type: 'signed-out' })
  }

  const client: SolvorxClient = {
    init,
    login,
    currentUser: () => store.getState().user,
    getStatus: () => store.getState().status,
    getAccessToken,
    logout,
    subscribe: (listener) => store.subscribe(listener),
    accountUrl: config.accountUrl,
  }

  // Un cliente por página es el caso normal: `<sx-login-button>` y
  // `<sx-user-menu>` lo toman de acá si nadie les asignó uno explícito por
  // la propiedad `.client`. Crear otro cliente lo reemplaza -"el último gana"-.
  setDefaultClient(client)

  return client
}

let defaultClient: SolvorxClient | null = null

/** El cliente que toman los componentes UI cuando no se les asigna uno por propiedad. */
export function getDefaultClient(): SolvorxClient | null {
  return defaultClient
}

/** Normalmente no hace falta llamarla a mano: `createSolvorxClient()` ya se registra sola. */
export function setDefaultClient(client: SolvorxClient | null): void {
  defaultClient = client
}
