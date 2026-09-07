import { describe, expect, it } from 'vitest'
import {
  SolvorxError,
  CLIENT_ERROR_CODE,
  errorFromResponse,
  isForbidden,
  isRateLimited,
  isUnauthorized,
  normalizeNetworkError,
} from './error'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

describe('errorFromResponse · envelope', () => {
  it('toma el código de dominio de result.code', async () => {
    const error = await errorFromResponse(
      jsonResponse(409, {
        traceId: 'trace-409',
        success: false,
        message: 'El teléfono ya está en uso',
        result: { isStandardError: true, code: 'user/phone-already-exists', timestamp: '' },
      }),
    )

    expect(error).toBeInstanceOf(SolvorxError)
    expect(error.code).toBe('user/phone-already-exists')
    expect(error.message).toBe('El teléfono ya está en uso')
    expect(error.traceId).toBe('trace-409')
    expect(error.status).toBe(409)
  })

  it('junta el message cuando llega como array', async () => {
    const error = await errorFromResponse(
      jsonResponse(400, {
        traceId: 'trace-policy',
        success: false,
        message: ['La contraseña debe tener al menos 12 caracteres', 'La contraseña es demasiado común'],
        result: null,
      }),
    )

    expect(error.message).toBe('La contraseña debe tener al menos 12 caracteres. La contraseña es demasiado común')
    expect(error.traceId).toBe('trace-policy')
  })

  it('cae a http/<status> cuando el error no es de dominio', async () => {
    const error = await errorFromResponse(
      jsonResponse(400, { traceId: 'trace-400', success: false, message: 'Validation error', result: null }),
    )

    expect(error.code).toBe('http/400')
  })
})

describe('errorFromResponse · OAuth (RFC 6749 §5.2)', () => {
  it('usa error como código y error_description como mensaje', async () => {
    const error = await errorFromResponse(
      jsonResponse(400, {
        error: 'invalid_grant',
        error_description: 'El código ya se usó o venció',
        trace_id: 'trace-oauth',
      }),
    )

    expect(error.code).toBe('invalid_grant')
    expect(error.message).toBe('El código ya se usó o venció')
    expect(error.traceId).toBe('trace-oauth')
  })

  it('inventa un mensaje cuando no viene error_description', async () => {
    const error = await errorFromResponse(jsonResponse(400, { error: 'unauthorized_client' }))

    expect(error.code).toBe('unauthorized_client')
    expect(error.message).toContain('no está habilitada')
  })

  it('tiene mensaje propio para invalid_token -antes caía en el genérico', async () => {
    const error = await errorFromResponse(jsonResponse(401, { error: 'invalid_token' }))

    expect(error.code).toBe('invalid_token')
    expect(error.message).not.toBe('Ocurrió un error inesperado.')
  })
})

describe('errorFromResponse · x-response-trace', () => {
  it('extrae el traceId del header cuando el body no lo trae', async () => {
    const error = await errorFromResponse(
      jsonResponse(500, { unexpected: true }, { 'x-response-trace': 'sx_management@sx-management-service@trace-header' }),
    )

    expect(error.traceId).toBe('trace-header')
  })
})

describe('errorFromResponse · retryAfter', () => {
  it('prefiere el header Retry-After', async () => {
    const error = await errorFromResponse(
      jsonResponse(
        429,
        { traceId: 't', success: false, message: 'Demasiados intentos.', result: null },
        { 'retry-after': '90' },
      ),
    )

    expect(error.retryAfter).toBe(90)
  })

  it('usa el campo retryAfter del body si el header no está', async () => {
    const error = await errorFromResponse(
      jsonResponse(429, { message: 'Demasiados intentos.', retryAfter: 120, result: null }),
    )

    expect(error.retryAfter).toBe(120)
  })

  it('parsea los minutos del mensaje cuando es lo único que llega', async () => {
    const error = await errorFromResponse(
      jsonResponse(429, {
        traceId: 't',
        success: false,
        message: 'Demasiados intentos. Volvé a intentar en 15 minuto(s).',
        result: null,
      }),
    )

    expect(isRateLimited(error)).toBe(true)
    expect(error.retryAfter).toBe(900)
  })
})

describe('el 403 de un cliente sin permiso', () => {
  it('se distingue de un 401', async () => {
    const error = await errorFromResponse(
      jsonResponse(403, { traceId: 't', success: false, message: 'invalid_token', result: null }),
    )

    expect(isForbidden(error)).toBe(true)
    expect(isUnauthorized(error)).toBe(false)
  })
})

describe('normalizeNetworkError', () => {
  it('marca la red caída', () => {
    const error = normalizeNetworkError(new TypeError('Failed to fetch'))
    expect(error.code).toBe(CLIENT_ERROR_CODE.network)
  })

  it('marca un request cancelado', () => {
    const error = normalizeNetworkError(new DOMException('The operation was aborted', 'AbortError'))
    expect(error.code).toBe(CLIENT_ERROR_CODE.canceled)
  })

  it('no vuelve a envolver un SolvorxError', () => {
    const original = new SolvorxError({ message: 'ya normalizado', code: 'x' })
    expect(normalizeNetworkError(original)).toBe(original)
  })
})
