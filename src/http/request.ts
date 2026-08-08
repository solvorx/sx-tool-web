import { CLIENT_ERROR_CODE, SolvorxError, errorFromResponse, normalizeNetworkError, type ApiEnvelope } from './error'

async function doFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    throw normalizeNetworkError(error)
  }
}

/**
 * Endpoint con envelope (`{ traceId, success, message, result }`): devuelve
 * `result` ya desenvuelto. Hoy ningún endpoint de `/v1/public/oauth/*` lo usa
 * -son todos `@RawResponse()`, ver `requestRaw`-, pero queda listo para las
 * extensiones previstas (p. ej. un futuro `listUser()` contra `bff-account`).
 */
export async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await doFetch(input, init)
  if (!response.ok) throw await errorFromResponse(response)

  const body: unknown = await response.json().catch(() => null)
  if (typeof body !== 'object' || body === null || !('result' in body)) {
    throw new SolvorxError({
      message: 'El servidor devolvió una respuesta con un formato inesperado.',
      code: CLIENT_ERROR_CODE.invalidResponse,
      status: response.status,
    })
  }

  return (body as ApiEnvelope<T>).result
}

/**
 * Endpoint `@RawResponse()`: el cuerpo tal cual, sin envelope. Es el formato
 * de todo `/v1/public/oauth/*`, que sigue el estándar en vez del de la casa.
 */
export async function requestRaw<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await doFetch(input, init)
  if (!response.ok) throw await errorFromResponse(response)
  return (await response.json()) as T
}
