import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SolvorxClient } from '../core/client'
import type { AuthStatus } from '../core/state'
import type { UserInfo } from '../oauth/endpoints'
import { mountUserMenu, SxUserMenu } from './user-menu'

if (!customElements.get('sx-user-menu')) {
  customElements.define('sx-user-menu', SxUserMenu)
}

function fakeUser(): UserInfo {
  return {
    sub: '1',
    name: 'Ana López',
    preferred_username: 'ana-48213',
    email: 'ana@example.com',
    email_verified: true,
    phone_number_verified: false,
    project: { id: 1, code: 'sx_management', name: 'SolvorX' },
    permissions: [],
  }
}

function fakeClient(
  initialStatus: AuthStatus,
  user: UserInfo | null = null,
): SolvorxClient & { emit: (status: AuthStatus, user: UserInfo | null) => void } {
  let status = initialStatus
  let currentUser = user
  const listeners = new Set<(status: AuthStatus, user: UserInfo | null) => void>()

  return {
    init: vi.fn(),
    login: vi.fn(),
    currentUser: () => currentUser,
    getStatus: () => status,
    getAccessToken: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    accountUrl: 'https://account.solvorx.com',
    emit(nextStatus, nextUser) {
      status = nextStatus
      currentUser = nextUser
      for (const listener of listeners) listener(status, currentUser)
    },
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('SxUserMenu', () => {
  it('se oculta si no está authenticated', () => {
    const el = document.createElement('sx-user-menu') as SxUserMenu
    document.body.appendChild(el)
    el.client = fakeClient('unauthenticated')

    expect(el.hidden).toBe(true)
  })

  it('muestra nombre, email y username cuando está authenticated', () => {
    const el = document.createElement('sx-user-menu') as SxUserMenu
    document.body.appendChild(el)
    el.client = fakeClient('authenticated', fakeUser())

    expect(el.hidden).toBe(false)
    const root = el.shadowRoot!
    expect(root.querySelector('[part="profile-name"]')?.textContent).toBe('Ana López')
    expect(root.querySelector('[part="profile-email"]')?.textContent).toBe('ana@example.com')
    expect(root.querySelector('[part="profile-username"]')?.textContent).toBe('@ana-48213')
    expect(root.querySelector('[part="account-link"]')?.getAttribute('href')).toBe('https://account.solvorx.com')
  })

  it('el botón de cerrar sesión llama a logout()', () => {
    const el = document.createElement('sx-user-menu') as SxUserMenu
    document.body.appendChild(el)
    const client = fakeClient('authenticated', fakeUser())
    el.client = client

    el.shadowRoot!.querySelector<HTMLButtonElement>('[part="logout-button"]')!.click()

    expect(client.logout).toHaveBeenCalled()
  })

  it('reacciona a cambios de estado del cliente', () => {
    const el = document.createElement('sx-user-menu') as SxUserMenu
    document.body.appendChild(el)
    const client = fakeClient('authenticated', fakeUser())
    el.client = client

    expect(el.hidden).toBe(false)
    client.emit('unauthenticated', null)
    expect(el.hidden).toBe(true)
  })
})

describe('mountUserMenu', () => {
  it('renderiza en un elemento plano sin registrar el custom element', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const client = fakeClient('authenticated', fakeUser())

    const unmount = mountUserMenu(host, { client })

    expect(host.hidden).toBe(false)
    expect(host.shadowRoot?.querySelector('[part="profile-name"]')?.textContent).toBe('Ana López')

    unmount()
  })

  it('sin cliente disponible, no lanza y avisa por consola', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = document.createElement('div')

    expect(() => mountUserMenu(host, { client: null })).not.toThrow()
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })
})
