import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_ERROR_CODE, SolvorxError } from './error'
import { request, requestRaw } from './request'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('requestRaw', () => {
  it('devuelve el cuerpo tal cual en éxito, sin desenvolver', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', token_type: 'Bearer', expires_in: 600 }), { status: 200 }),
    )

    const result = await requestRaw<{ access_token: string }>('http://localhost:9000/v1/public/oauth/token')

    expect(result).toEqual({ access_token: 'tok', token_type: 'Bearer', expires_in: 600 })
  })

  it('lanza SolvorxError normalizado ante un status fuera de 2xx', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))

    await expect(requestRaw('http://localhost:9000/v1/public/oauth/token')).rejects.toMatchObject({
      code: 'invalid_grant',
      status: 400,
    })
  })

  it('normaliza un fallo de red antes de que llegue una Response', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await requestRaw('http://localhost:9000/v1/public/oauth/token').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SolvorxError)
    expect((error as SolvorxError).code).toBe(CLIENT_ERROR_CODE.network)
  })
})

describe('request', () => {
  it('desenvuelve result del envelope de la casa', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ traceId: 't', success: true, message: 'ok', result: { id: 1, name: 'Ana' } }),
        { status: 200 },
      ),
    )

    const result = await request<{ id: number; name: string }>('http://localhost:9000/v1/bff-account/me')

    expect(result).toEqual({ id: 1, name: 'Ana' })
  })

  it('lanza invalidResponse si el cuerpo no tiene forma de envelope', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200 }))

    await expect(request('http://localhost:9000/v1/bff-account/me')).rejects.toMatchObject({
      code: CLIENT_ERROR_CODE.invalidResponse,
    })
  })

  it('propaga el error normalizado ante un status fuera de 2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ traceId: 't', success: false, message: 'No autorizado', result: null }), {
        status: 401,
      }),
    )

    await expect(request('http://localhost:9000/v1/bff-account/me')).rejects.toMatchObject({
      status: 401,
      message: 'No autorizado',
    })
  })
})

describe('request/requestRaw · pasan el init a fetch', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
  })

  it('reenvía method, headers y body', async () => {
    await requestRaw('http://localhost:9000/v1/public/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:9000/v1/public/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token',
    })
  })
})
