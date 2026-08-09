import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSolvorxBffClient, type SolvorxClient, type SolvorxSessionSource } from '../core/client'
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

  it('reacciona a cambios de estado del cliente', () => {
    const el = document.createElement('sx-user-menu') as SxUserMenu
    document.body.appendChild(el)
    const client = fakeClient('authenticated', fakeUser())
    el.client = client

    expect(el.hidden).toBe(false)
    client.emit('unauthenticated', null)
    expect(el.hidden).toBe(true)
  })

  describe('las dos salidas', () => {
    it('"acá" llama a logout({ scope: "here" })', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      const client = fakeClient('authenticated', fakeUser())
      el.client = client

      el.shadowRoot!.querySelector<HTMLButtonElement>('[part="logout-here-button"]')!.click()

      expect(client.logout).toHaveBeenCalledWith({ scope: 'here' })
    })

    it('"todas las apps" llama a logout({ scope: "everywhere" })', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      const client = fakeClient('authenticated', fakeUser())
      el.client = client

      el.shadowRoot!.querySelector<HTMLButtonElement>('[part="logout-everywhere-button"]')!.click()

      expect(client.logout).toHaveBeenCalledWith({ scope: 'everywhere' })
    })

    it('cada salida muestra su título y su descripción por default', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      el.client = fakeClient('authenticated', fakeUser())

      const root = el.shadowRoot!
      const here = root.querySelector('[part="logout-here-button"]')!
      const everywhere = root.querySelector('[part="logout-everywhere-button"]')!

      expect(here.querySelector('.sx-item-title')?.textContent).toBe('Cerrar sesión acá')
      expect(here.querySelector('.sx-item-description')?.textContent).toMatch(/resto de las apps/)
      expect(everywhere.querySelector('.sx-item-title')?.textContent).toBe('Cerrar sesión en todas las apps')
    })
  })

  describe('labels custom', () => {
    it('la propiedad .labels pisa los defaults', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      el.labels = {
        accountLink: 'Ir a mi perfil',
        signOutHereTitle: 'Salir de acá',
      }
      el.client = fakeClient('authenticated', fakeUser())

      const root = el.shadowRoot!
      expect(root.querySelector('[part="account-link"]')?.textContent).toBe('Ir a mi perfil')
      expect(root.querySelector('[part="logout-here-button"] .sx-item-title')?.textContent).toBe('Salir de acá')
      // Lo que no se pisa sigue siendo el default.
      expect(root.querySelector('[part="logout-everywhere-button"] .sx-item-title')?.textContent).toBe(
        'Cerrar sesión en todas las apps',
      )
    })
  })

  describe('propiedades', () => {
    it('.client, .labels y .accountLinkTarget se leen de vuelta tal cual se asignaron', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      const client = fakeClient('authenticated', fakeUser())

      el.client = client
      el.labels = { accountLink: 'Ir a mi perfil' }
      el.accountLinkTarget = '_self'

      expect(el.client).toBe(client)
      expect(el.labels).toEqual({ accountLink: 'Ir a mi perfil' })
      expect(el.accountLinkTarget).toBe('_self')
      expect(el.shadowRoot?.querySelector('[part="account-link"]')?.getAttribute('target')).toBe('_self')
    })
  })

  describe('foco al abrir', () => {
    it('mueve el foco al primer elemento del panel cuando <details> se abre', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      el.client = fakeClient('authenticated', fakeUser())

      const root = el.shadowRoot!
      const details = root.querySelector('details')!
      const accountLink = root.querySelector<HTMLAnchorElement>('[part="account-link"]')!

      details.open = true
      details.dispatchEvent(new Event('toggle'))

      expect(root.activeElement).toBe(accountLink)
    })
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

  it('acepta accountLinkTarget para pisar el default "_blank"', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const client = fakeClient('authenticated', fakeUser())

    const unmount = mountUserMenu(host, { client, accountLinkTarget: '_self' })

    expect(host.shadowRoot?.querySelector('[part="account-link"]')?.getAttribute('target')).toBe('_self')

    unmount()
  })
})

describe('createSolvorxBffClient', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('arranca "authenticated" con el usuario hidratado por el servidor, sin tokens en el navegador', () => {
    const client = createSolvorxBffClient({
      user: fakeUser(),
      accountUrl: '/profile',
      logoutUrl: '/api/auth/logout',
      issuer: 'http://localhost:9000',
    })

    expect(client.getStatus()).toBe('authenticated')
    expect(client.currentUser()).toEqual(fakeUser())
    expect('getAccessToken' in client).toBe(false)
    expect('init' in client).toBe(false)
  })

  it('arranca "unauthenticated" si no hay usuario', () => {
    const client = createSolvorxBffClient({
      user: null,
      accountUrl: '/profile',
      logoutUrl: '/api/auth/logout',
      issuer: 'http://localhost:9000',
    })

    expect(client.getStatus()).toBe('unauthenticated')
    expect(client.currentUser()).toBeNull()
  })

  it('logout({ scope: "here" }) solo pega contra logoutUrl, no contra el SSO', async () => {
    const client = createSolvorxBffClient({
      user: fakeUser(),
      accountUrl: '/profile',
      logoutUrl: '/api/auth/logout',
      issuer: 'http://localhost:9000',
    })

    await client.logout({ scope: 'here' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(client.getStatus()).toBe('unauthenticated')
  })

  it('logout({ scope: "everywhere" }) además pega contra el logout de SSO del issuer', async () => {
    const client = createSolvorxBffClient({
      user: fakeUser(),
      accountUrl: '/profile',
      logoutUrl: '/api/auth/logout',
      issuer: 'http://localhost:9000',
    })

    await client.logout({ scope: 'everywhere' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:9000/v1/public/oauth/logout', {
      method: 'POST',
      credentials: 'include',
    })
  })

  it('sirve para <sx-user-menu> igual que un SolvorxClient completo', () => {
    const client: SolvorxSessionSource = createSolvorxBffClient({
      user: fakeUser(),
      accountUrl: '/profile',
      logoutUrl: '/api/auth/logout',
      issuer: 'http://localhost:9000',
    })

    const el = document.createElement('sx-user-menu') as SxUserMenu
    document.body.appendChild(el)
    el.client = client

    expect(el.hidden).toBe(false)
    expect(el.shadowRoot?.querySelector('[part="profile-name"]')?.textContent).toBe('Ana López')
  })
})
