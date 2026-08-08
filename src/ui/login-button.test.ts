import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthStatus } from '../core/state'
import type { SolvorxClient } from '../core/client'
import type { UserInfo } from '../oauth/endpoints'
import { SxLoginButton } from './login-button'

if (!customElements.get('sx-login-button')) {
  customElements.define('sx-login-button', SxLoginButton)
}

function fakeClient(initialStatus: AuthStatus): SolvorxClient & { emit: (status: AuthStatus) => void } {
  let status = initialStatus
  const listeners = new Set<(status: AuthStatus, user: UserInfo | null) => void>()

  return {
    init: vi.fn(),
    login: vi.fn().mockResolvedValue(undefined),
    currentUser: () => null,
    getStatus: () => status,
    getAccessToken: vi.fn(),
    logout: vi.fn(),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    accountUrl: 'https://account.solvorx.com',
    emit(next) {
      status = next
      for (const listener of listeners) listener(status, null)
    },
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('SxLoginButton', () => {
  it('se muestra cuando el cliente está unauthenticated', () => {
    const el = document.createElement('sx-login-button') as SxLoginButton
    document.body.appendChild(el)
    el.client = fakeClient('unauthenticated')

    expect(el.hidden).toBe(false)
  })

  it('se oculta mientras el cliente está loading o authenticated', () => {
    const el = document.createElement('sx-login-button') as SxLoginButton
    document.body.appendChild(el)
    el.client = fakeClient('loading')

    expect(el.hidden).toBe(true)
  })

  it('reacciona a cambios de estado del cliente', () => {
    const el = document.createElement('sx-login-button') as SxLoginButton
    document.body.appendChild(el)
    const client = fakeClient('loading')
    el.client = client

    expect(el.hidden).toBe(true)
    client.emit('unauthenticated')
    expect(el.hidden).toBe(false)
    client.emit('authenticated')
    expect(el.hidden).toBe(true)
  })

  it('al hacer click llama a login() con returnTo y prompt de los atributos', () => {
    const el = document.createElement('sx-login-button') as SxLoginButton
    el.setAttribute('return-to', '/dashboard')
    el.setAttribute('prompt', 'login')
    document.body.appendChild(el)
    const client = fakeClient('unauthenticated')
    el.client = client

    el.shadowRoot?.querySelector('button')?.click()

    expect(client.login).toHaveBeenCalledWith({ returnTo: '/dashboard', prompt: 'login' })
  })
})
