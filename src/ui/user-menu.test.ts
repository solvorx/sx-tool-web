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
    sub: 'usr-001',
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

  describe('la salida única', () => {
    it('llama a logout({ scope: "everywhere" })', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      const client = fakeClient('authenticated', fakeUser())
      el.client = client

      el.shadowRoot!.querySelector<HTMLButtonElement>('[part="logout-everywhere-button"]')!.click()

      expect(client.logout).toHaveBeenCalledWith({ scope: 'everywhere' })
    })

    it('muestra su título y su descripción por default', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      el.client = fakeClient('authenticated', fakeUser())

      const root = el.shadowRoot!
      const everywhere = root.querySelector('[part="logout-everywhere-button"]')!

      expect(everywhere.querySelector('.sx-item-title')?.textContent).toBe('Cerrar sesión en todas las apps')
    })
  })

  describe('estilo de la salida global', () => {
    // Aserciones de forma sobre el string de estilos: fijan la ausencia de
    // regresiones puntuales (botón gris del UA, separador huérfano), no
    // valores exactos de color.
    it('la salida global se ve como acción destructiva, no como botón gris del sistema', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      el.client = fakeClient('authenticated', fakeUser())

      const css = el.shadowRoot!.querySelector('style')!.textContent ?? ''
      expect(css).toMatch(/button\s*\{[^}]*background:\s*transparent/) // el reset compartido
      const rule = css.slice(css.indexOf("[part='logout-everywhere-button'] {"))
      expect(rule).toMatch(/var\(--sx-color-danger\)/)
      expect(rule).not.toMatch(/border-radius:\s*0\b/)
      expect(rule).not.toMatch(/border-top:/) // el separador huérfano
    })
  })

  describe('z-index del panel', () => {
    // El panel es `position: absolute` sin stacking context propio -pinta en
    // el del host page-, así que necesita un z-index explícito o pierde
    // contra cualquier elemento posicionado de la app que integra (bug real:
    // ver AGENTS.md / README.md, sección `--sx-z-panel`). Aserción de forma
    // sobre el string de estilos, mismo criterio que 'estilo de la salida
    // global' más abajo -fija que la regla exista, no un valor de recorte
    // exacto de CSS-.
    it('el panel declara z-index vía --sx-z-panel, con fallback a 100', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      el.client = fakeClient('authenticated', fakeUser())

      const css = el.shadowRoot!.querySelector('style')!.textContent ?? ''
      expect(css).toMatch(/--sx-z-panel:\s*100/) // declarada en :host (sharedStyles)
      const rule = css.slice(css.indexOf("[part='panel'] {"))
      expect(rule).toMatch(/z-index:\s*var\(--sx-z-panel,\s*100\)/)
    })
  })

  describe('labels custom', () => {
    it('la propiedad .labels pisa los defaults', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      el.labels = {
        accountLink: 'Ir a mi perfil',
        signOutEverywhereTitle: 'Salir de todas',
      }
      el.client = fakeClient('authenticated', fakeUser())

      const root = el.shadowRoot!
      expect(root.querySelector('[part="account-link"]')?.textContent).toBe('Ir a mi perfil')
      expect(root.querySelector('[part="logout-everywhere-button"] .sx-item-title')?.textContent).toBe('Salir de todas')
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

  describe('tema', () => {
    it('sin la opción theme no se renderiza la sección de tema', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      el.client = fakeClient('authenticated', fakeUser())

      expect(el.shadowRoot!.querySelector('[part="theme"]')).toBeNull()
    })

    it('con theme hay 3 radios y el aria-checked marca el valor inicial', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      el.theme = { value: 'dark', onChange: vi.fn() }
      el.client = fakeClient('authenticated', fakeUser())

      const root = el.shadowRoot!
      expect(root.querySelector('[part="theme"]')?.getAttribute('role')).toBe('radiogroup')
      const options = root.querySelectorAll('[part="theme-option"]')
      expect(options).toHaveLength(3)
      expect(options[0]?.getAttribute('aria-checked')).toBe('false') // light
      expect(options[1]?.getAttribute('aria-checked')).toBe('true') // dark
      expect(options[2]?.getAttribute('aria-checked')).toBe('false') // system
    })

    it('el click llama a onChange, mueve el aria-checked y no cierra el panel', () => {
      const el = document.createElement('sx-user-menu') as SxUserMenu
      document.body.appendChild(el)
      const onChange = vi.fn()
      el.theme = { value: 'light', onChange }
      el.client = fakeClient('authenticated', fakeUser())

      const root = el.shadowRoot!
      const details = root.querySelector('details')!
      details.open = true

      const options = root.querySelectorAll<HTMLButtonElement>('[part="theme-option"]')
      options[2]!.click() // system

      expect(onChange).toHaveBeenCalledWith('system')
      expect(options[0]?.getAttribute('aria-checked')).toBe('false')
      expect(options[2]?.getAttribute('aria-checked')).toBe('true')
      expect(details.open).toBe(true)
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
      clientId: 'sx-account-web',
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
      clientId: 'sx-account-web',
      logoutUrl: '/api/auth/logout',
      issuer: 'http://localhost:9000',
    })

    expect(client.getStatus()).toBe('unauthenticated')
    expect(client.currentUser()).toBeNull()
  })

  it('logout({ scope: "here" }) pega una sola vez contra logoutUrl, con el scope en el cuerpo', async () => {
    const client = createSolvorxBffClient({
      user: fakeUser(),
      accountUrl: '/profile',
      clientId: 'sx-account-web',
      logoutUrl: '/api/auth/logout',
      issuer: 'http://localhost:9000',
    })

    await client.logout({ scope: 'here' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'here' }),
    })
    expect(client.getStatus()).toBe('unauthenticated')
  })

  /**
   * El contrato que reemplazó al `ssoLogout` desde el navegador: ese `fetch`
   * era cross-site contra el Authorization Server y la cookie `sx_sso`
   * (`SameSite=Lax`) no viajaba, así que el logout quedaba en nada. Ahora el
   * alcance viaja al BFF y lo cierra él, server-to-server.
   */
  it('logout({ scope: "everywhere" }) NO pega contra el issuer: manda el scope al BFF y nada más', async () => {
    const client = createSolvorxBffClient({
      user: fakeUser(),
      accountUrl: '/profile',
      clientId: 'sx-account-web',
      logoutUrl: '/api/auth/logout',
      issuer: 'http://localhost:9000',
    })

    await client.logout({ scope: 'everywhere' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'everywhere' }),
    })
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://localhost:9000/v1/public/oauth/logout',
      expect.anything(),
    )
  })

  it('sirve para <sx-user-menu> igual que un SolvorxClient completo', () => {
    const client: SolvorxSessionSource = createSolvorxBffClient({
      user: fakeUser(),
      accountUrl: '/profile',
      clientId: 'sx-account-web',
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
