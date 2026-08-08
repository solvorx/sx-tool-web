// JS plano, sin bundler: el navegador importa `dist/index.js` (ESM sin
// imports externos) directo. Ver README, sección "Probar contra el stack
// local", y `scripts/serve-playground.mjs` para cómo se sirve esto.
import {
  createSolvorxClient,
  readAccessTokenClaims,
  registerSolvorxElements,
  setDefaultClient,
  SolvorxError,
} from '/dist/index.js'

const CONFIG_KEY = 'sx-playground-config'
const DEFAULT_CONFIG = {
  issuer: 'http://localhost:9000',
  clientId: 'sx-console-web',
  redirectUri: 'http://localhost:3002/callback',
}

// Distingue de qué pestaña vino cada línea del log cuando hay varias abiertas.
const tabId = Math.random().toString(36).slice(2, 7)
document.getElementById('tab-id').textContent = tabId

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

const config = loadConfig()

const form = document.getElementById('config-form')
form.issuer.value = config.issuer
form.clientId.value = config.clientId
form.redirectUri.value = config.redirectUri

form.addEventListener('submit', (event) => {
  event.preventDefault()
  saveConfig({
    issuer: form.issuer.value.replace(/\/+$/, ''),
    clientId: form.clientId.value,
    redirectUri: form.redirectUri.value,
  })
  location.assign('/')
})

// ─── log en vivo ─────────────────────────────────────────────────────────────

const logEl = document.getElementById('log')

function log(message) {
  const line = document.createElement('div')
  line.className = 'log-line'
  const time = document.createElement('time')
  time.textContent = new Date().toLocaleTimeString()
  line.append(time, document.createTextNode(`[${tabId}] ${message}`))
  logEl.prepend(line)
}

// ─── arranque ────────────────────────────────────────────────────────────────

// createSolvorxClient() ANTES de registerSolvorxElements(): <sx-login-button>
// y <sx-user-menu> ya están en index.html, así que definir el Custom Element
// las "upgradea" ahí mismo -sincrónico- y connectedCallback busca el cliente
// default en ese instante. Al revés, se bindean a null y quedan ocultas para
// siempre (no hay una segunda oportunidad). Ver el JSDoc de
// registerSolvorxElements() en src/index.ts -esto se descubrió corriendo
// este mismo playground contra SXMS real, no con los tests con mocks-.
const sx = createSolvorxClient(config)

registerSolvorxElements()

const statusBadge = document.getElementById('status-badge')
const userJson = document.getElementById('user-json')
const refreshPresence = document.getElementById('refresh-token-presence')

function refreshTokenKey() {
  // Mismo esquema que `session/token-store.ts#keyFor`: no hay forma de leerlo
  // desde la API pública -a propósito-, así que se reconstruye acá solo para
  // mostrar presencia, nunca el valor.
  return `sx:${config.clientId}:refresh_token`
}

function renderState(status, user) {
  statusBadge.textContent = status
  statusBadge.className = `badge ${status}`
  userJson.textContent = JSON.stringify(user, null, 2)
  refreshPresence.textContent = localStorage.getItem(refreshTokenKey())
    ? 'refresh token: presente en localStorage (valor no mostrado)'
    : 'refresh token: ausente'
}

// Suscripto ANTES de init() para que el log capture la transición desde 'loading'.
sx.subscribe((status, user) => {
  renderState(status, user)
  log(`subscribe: ${status}${user ? ` · ${user.email}` : ''}`)
})
renderState(sx.getStatus(), sx.currentUser())

// Espeja el BroadcastChannel que arma `session/sync.ts` -mismo nombre de
// canal-, solo para loguear lo que otras pestañas de esta app se avisan.
const mirror = new BroadcastChannel(`sx-session:${config.clientId}`)
mirror.onmessage = (event) => log(`BroadcastChannel: ${JSON.stringify(event.data)}`)

log(`init() con issuer=${config.issuer} clientId=${config.clientId} redirectUri=${config.redirectUri}`)

try {
  await sx.init()
  log('init() resuelto')
} catch (error) {
  if (SolvorxError.is(error)) {
    log(
      `init() falló → message="${error.message}" code=${error.code} status=${error.status} traceId=${error.traceId ?? '-'}`,
    )
  } else {
    log(`init() falló con un error que no es SolvorxError: ${String(error)}`)
  }
}

// ─── botones ─────────────────────────────────────────────────────────────────

const actionResult = document.getElementById('action-result')

function showResult(value) {
  actionResult.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

document.getElementById('btn-get-token').addEventListener('click', async () => {
  try {
    const token = await sx.getAccessToken()
    const claims = readAccessTokenClaims(token)
    const secondsLeft = claims?.exp ? Math.round(claims.exp - Date.now() / 1000) : null
    showResult(`${token.slice(0, 24)}… (${secondsLeft ?? '?'}s restantes)`)
    log(`getAccessToken(): ok, ${secondsLeft ?? '?'}s restantes`)
  } catch (error) {
    showResult(String(error))
    log(`getAccessToken(): falló → ${error}`)
  }
})

document.getElementById('btn-concurrency').addEventListener('click', async () => {
  // Cliente efímero con la misma config ⇒ mismo lockName (`sx-refresh:<clientId>`)
  // y mismo storage que el cliente principal -ver `session/refresh.ts`-, pero
  // con `current` en memoria arrancando en null, para que las 3 llamadas no
  // devuelvan directo del caché del cliente principal. `createSolvorxClient`
  // se registra solo como default ("el último gana"), así que hay que
  // restaurar `sx` al terminar o los componentes UI quedan mirando este
  // cliente descartable.
  log('concurrencia: creando cliente efímero (mismo clientId ⇒ mismo lock y storage)')
  const ephemeral = createSolvorxClient(config)
  try {
    const start = performance.now()
    const tokens = await Promise.all([
      ephemeral.getAccessToken(),
      ephemeral.getAccessToken(),
      ephemeral.getAccessToken(),
    ])
    const elapsed = Math.round(performance.now() - start)
    const unique = new Set(tokens).size
    showResult(
      `3 llamadas resueltas en ${elapsed}ms, ${unique} token(s) distinto(s).\n` +
        `Mirá la pestaña de red: debería haber un solo POST a /token.`,
    )
    log(
      `concurrencia: ${unique} token(s) distinto(s) en ${elapsed}ms. Nota: esto rota el refresh ` +
        `token una vez -inofensivo, el cliente principal lo relee del storage dentro de su propio lock la próxima vez que renueve.`,
    )
  } catch (error) {
    showResult(String(error))
    log(`concurrencia: falló → ${error}`)
  } finally {
    setDefaultClient(sx)
  }
})

document.getElementById('btn-sessions').addEventListener('click', async () => {
  try {
    const token = await sx.getAccessToken()
    const response = await fetch(`${config.issuer}/v1/bff-account/session`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await response.json()
    showResult(body)
    log(`GET /v1/bff-account/session → ${response.status}`)
  } catch (error) {
    showResult(String(error))
    log(`GET /v1/bff-account/session: falló → ${error}`)
  }
})

document.getElementById('btn-open-tabs').addEventListener('click', () => {
  for (let i = 0; i < 6; i++) window.open(location.origin, '_blank')
  log('abiertas 6 pestañas nuevas')
})

document.getElementById('btn-login-force').addEventListener('click', () => {
  log("login({ prompt: 'login' })")
  void sx.login({ prompt: 'login' })
})

document.getElementById('btn-logout').addEventListener('click', async () => {
  log('logout()')
  await sx.logout()
  log('logout() resuelto')
})
