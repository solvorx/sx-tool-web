/**
 * Error normalizado + las dos formas en las que sx-management-service puede
 * fallar: el envelope de la casa (`{ traceId, success: false, message, result }`)
 * y el de OAuth 2.0 (`{ error, error_description }`, RFC 6749 §5.2). A eso se
 * suma el caso sin respuesta (red caída, request cancelado).
 *
 * A diferencia de `sx-account-web/src/lib/api/error.ts`, acá no hay
 * `isAccountLocked`: ese predicado distinguía por regex un mensaje en
 * español ("cuenta bloqueada") porque el 401 de login no traía código de
 * dominio. Este paquete no habla con el endpoint de login — solo con
 * `/v1/public/oauth/*`, que si tiene algo que decir lo dice en `error`, no en
 * texto libre.
 */

/** Envelope estándar del backend (`IApiResponse<T>`). */
export interface ApiEnvelope<T> {
  traceId: string
  success: boolean
  message: string
  result: T
}

interface StandardErrorResult {
  isStandardError: boolean
  code: string
}

interface OAuthErrorBody {
  error: string
  error_description?: string
  trace_id?: string
}

/** Códigos que genera el cliente, no el backend. Prefijados para no chocar con uno de dominio. */
export const CLIENT_ERROR_CODE = {
  network: 'client/network',
  canceled: 'client/canceled',
  invalidResponse: 'client/invalid-response',
  /** No hay sesión, o el refresh murió y no se pudo renovar. */
  noSession: 'client/no-session',
  /** El `state` del callback no coincide con el guardado: posible CSRF. */
  stateMismatch: 'client/state-mismatch',
  unknown: 'client/unknown',
} as const

export type ClientErrorCode = (typeof CLIENT_ERROR_CODE)[keyof typeof CLIENT_ERROR_CODE]

/** Todo lo que sale de este paquete falla con esto, venga de un envelope, de OAuth o de la red. */
export class SolvorxError extends Error {
  /** Código estable para ramificar: uno de `CLIENT_ERROR_CODE`, un `error` de OAuth, o `http/<status>`. */
  readonly code: string
  /** `traceId` del backend, si vino. */
  readonly traceId: string | null
  /** Status HTTP; `0` cuando no hubo respuesta. */
  readonly status: number
  /** Segundos para poder reintentar. Solo en 429. */
  readonly retryAfter: number | null

  constructor(init: {
    message: string
    code: string
    traceId?: string | null
    status?: number
    retryAfter?: number | null
  }) {
    super(init.message)
    this.name = 'SolvorxError'
    this.code = init.code
    this.traceId = init.traceId ?? null
    this.status = init.status ?? 0
    this.retryAfter = init.retryAfter ?? null
  }

  static is(error: unknown): error is SolvorxError {
    return error instanceof SolvorxError
  }
}

/** `x-response-trace`: `<projectCode>@<serviceName>@<traceId>`. Solo nos interesa el traceId. */
function parseResponseTrace(header: string | null): string | null {
  if (!header) return null
  const parts = header.split('@')
  return parts.length === 3 ? (parts[2] ?? null) : null
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function asOAuthErrorBody(body: unknown): OAuthErrorBody | null {
  if (typeof body !== 'object' || body === null) return null
  const candidate = body as Record<string, unknown>
  if (typeof candidate.error !== 'string') return null

  return {
    error: candidate.error,
    error_description:
      typeof candidate.error_description === 'string' ? candidate.error_description : undefined,
    trace_id: typeof candidate.trace_id === 'string' ? candidate.trace_id : undefined,
  }
}

function asErrorEnvelope(body: unknown): ApiEnvelope<unknown> | null {
  if (typeof body !== 'object' || body === null) return null
  const candidate = body as Record<string, unknown>

  const message = asMessage(candidate.message)
  if (message === null) return null

  return {
    traceId: typeof candidate.traceId === 'string' ? candidate.traceId : '',
    success: false,
    message,
    result: candidate.result,
  }
}

/** `message` puede llegar como array de strings; se junta en una sola oración. */
function asMessage(raw: unknown): string | null {
  if (typeof raw === 'string') return raw

  if (Array.isArray(raw)) {
    const parts = raw.filter((item): item is string => typeof item === 'string')
    if (parts.length > 0) return parts.join('. ')
  }

  return null
}

function asStandardErrorResult(result: unknown): StandardErrorResult | null {
  if (typeof result !== 'object' || result === null) return null
  const candidate = result as Record<string, unknown>
  if (candidate.isStandardError !== true || typeof candidate.code !== 'string') return null

  return { isStandardError: true, code: candidate.code }
}

/** Segundos hasta poder reintentar: header `Retry-After`, campo `retryAfter` del body, o "N minuto(s)" del texto. */
function resolveRetryAfter(header: string | null, body: unknown, message: string | null | undefined): number | null {
  const fromHeader = Number(header)
  if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.ceil(fromHeader)

  if (typeof body === 'object' && body !== null) {
    const raw = (body as Record<string, unknown>).retryAfter
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.ceil(raw)
  }

  return parseMinutesFromMessage(message)
}

function parseMinutesFromMessage(message: string | null | undefined): number | null {
  if (!message) return null

  const match = /(\d+)\s*minuto/i.exec(message)
  if (!match?.[1]) return null

  const minutes = Number(match[1])
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : null
}

function oauthFallbackMessage(code: string): string {
  switch (code) {
    case 'invalid_request':
      return 'La solicitud es inválida.'
    case 'unauthorized_client':
    case 'invalid_client':
      return 'Esta aplicación no está habilitada para iniciar sesión.'
    case 'access_denied':
      return 'Acceso denegado.'
    case 'invalid_grant':
      return 'El código de autorización ya se usó o venció.'
    default:
      return 'Ocurrió un error inesperado.'
  }
}

/** Convierte una respuesta HTTP no exitosa (status fuera de 2xx) en un `SolvorxError`. */
export async function errorFromResponse(response: Response): Promise<SolvorxError> {
  const status = response.status
  const trace = parseResponseTrace(response.headers.get('x-response-trace'))
  const retryAfterHeader = response.headers.get('retry-after')
  const body = await safeJson(response)

  const oauth = asOAuthErrorBody(body)
  if (oauth) {
    return new SolvorxError({
      message: oauth.error_description || oauthFallbackMessage(oauth.error),
      code: oauth.error,
      traceId: oauth.trace_id ?? trace,
      status,
      retryAfter: resolveRetryAfter(retryAfterHeader, body, oauth.error_description),
    })
  }

  const envelope = asErrorEnvelope(body)
  if (envelope) {
    const domainCode = asStandardErrorResult(envelope.result)?.code
    return new SolvorxError({
      message: envelope.message || 'Ocurrió un error inesperado.',
      code: domainCode ?? `http/${status}`,
      traceId: envelope.traceId || trace,
      status,
      retryAfter: resolveRetryAfter(retryAfterHeader, body, envelope.message),
    })
  }

  return new SolvorxError({
    message: 'Ocurrió un error inesperado.',
    code: `http/${status}`,
    traceId: trace,
    status,
    retryAfter: resolveRetryAfter(retryAfterHeader, body, null),
  })
}

/** Convierte lo que tira `fetch` cuando no hay respuesta: red caída o request cancelado. */
export function normalizeNetworkError(error: unknown): SolvorxError {
  if (SolvorxError.is(error)) return error

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new SolvorxError({ message: 'La solicitud fue cancelada.', code: CLIENT_ERROR_CODE.canceled })
  }

  if (error instanceof Error) {
    return new SolvorxError({
      message: error.message || 'No se pudo conectar con el servidor.',
      code: CLIENT_ERROR_CODE.network,
    })
  }

  return new SolvorxError({ message: 'Ocurrió un error inesperado.', code: CLIENT_ERROR_CODE.unknown })
}

// ─── Predicados de uso frecuente ─────────────────────────────────────────────

/** `429`: se agotó el límite de intentos. */
export function isRateLimited(error: unknown): boolean {
  return SolvorxError.is(error) && error.status === 429
}

/** El access token venció, se revocó, o no había ninguno. */
export function isUnauthorized(error: unknown): boolean {
  return SolvorxError.is(error) && error.status === 401
}

/** El cliente OAuth no tiene permiso sobre lo que pidió. */
export function isForbidden(error: unknown): boolean {
  return SolvorxError.is(error) && error.status === 403
}

/** No hay sesión utilizable: hay que volver a pasar por `login()`. */
export function isSessionMissing(error: unknown): boolean {
  return SolvorxError.is(error) && error.code === CLIENT_ERROR_CODE.noSession
}
