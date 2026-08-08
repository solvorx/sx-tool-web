import { getDefaultClient, type SolvorxClient } from '../core/client'
import type { AuthStatus } from '../core/state'
import type { UserInfo } from '../oauth/endpoints'
import { createAvatarElement } from './avatar'
import { sharedStyles } from './styles'

// Ver el comentario equivalente en `login-button.ts`: sin este fallback,
// importar este módulo bajo Node plano (sin jsdom) revienta con
// `ReferenceError: HTMLElement is not defined` apenas se evalúa la clase, sin
// llegar siquiera a la guarda de `registerSolvorxElements()`.
const HTMLElementBase = globalThis.HTMLElement ?? (class {} as unknown as typeof HTMLElement)

const MENU_STYLES = `
  details {
    position: relative;
  }

  summary {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.25em 0.5em 0.25em 0.25em;
    border-radius: var(--sx-radius);
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    background: color-mix(in srgb, var(--sx-color-fg) 6%, transparent);
  }

  summary:focus-visible {
    outline: 2px solid var(--sx-color-primary);
    outline-offset: 2px;
  }

  .sx-trigger-name {
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  [part='panel'] {
    position: absolute;
    top: calc(100% + 0.375rem);
    right: 0;
    min-width: 14rem;
    padding: 0.75rem;
    border: 1px solid var(--sx-color-border);
    border-radius: var(--sx-radius);
    background: var(--sx-color-bg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  [part='profile-name'] {
    font-weight: 600;
  }

  [part='profile-email'],
  [part='profile-username'] {
    color: var(--sx-color-fg-muted);
    font-size: 0.9em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  [part='account-link'],
  [part='logout-button'] {
    display: block;
    width: 100%;
    padding: 0.5em;
    border: none;
    border-radius: calc(var(--sx-radius) - 2px);
    text-align: left;
    margin-top: 0.25rem;
  }

  [part='account-link']:hover,
  [part='logout-button']:hover {
    background: color-mix(in srgb, var(--sx-color-fg) 6%, transparent);
  }

  [part='logout-button'] {
    color: var(--sx-color-danger);
  }
`

interface UserMenuView {
  details: HTMLDetailsElement
  triggerAvatar: HTMLElement
  triggerName: HTMLElement
  profileName: HTMLElement
  profileEmail: HTMLElement
  profileUsername: HTMLElement
  accountLink: HTMLAnchorElement
  logoutButton: HTMLButtonElement
}

function buildView(root: ShadowRoot): UserMenuView {
  const style = document.createElement('style')
  style.textContent = `${sharedStyles}\n${MENU_STYLES}`

  const details = document.createElement('details')
  details.setAttribute('part', 'menu')

  const summary = document.createElement('summary')
  summary.setAttribute('part', 'trigger')

  const triggerAvatar = document.createElement('span')
  const triggerName = document.createElement('span')
  triggerName.setAttribute('part', 'name')
  triggerName.className = 'sx-trigger-name'
  summary.append(triggerAvatar, triggerName)

  const panel = document.createElement('div')
  panel.setAttribute('part', 'panel')

  const profile = document.createElement('div')
  profile.setAttribute('part', 'profile')
  const profileName = document.createElement('div')
  profileName.setAttribute('part', 'profile-name')
  const profileEmail = document.createElement('div')
  profileEmail.setAttribute('part', 'profile-email')
  const profileUsername = document.createElement('div')
  profileUsername.setAttribute('part', 'profile-username')
  profile.append(profileName, profileEmail, profileUsername)

  const accountLink = document.createElement('a')
  accountLink.setAttribute('part', 'account-link')
  accountLink.textContent = 'Mi cuenta'
  accountLink.target = '_blank'
  accountLink.rel = 'noopener'

  const logoutButton = document.createElement('button')
  logoutButton.setAttribute('part', 'logout-button')
  logoutButton.type = 'button'
  logoutButton.textContent = 'Cerrar sesión'

  panel.append(profile, accountLink, logoutButton)
  details.append(summary, panel)
  root.append(style, details)

  return { details, triggerAvatar, triggerName, profileName, profileEmail, profileUsername, accountLink, logoutButton }
}

/**
 * Arma el menú dentro de `root` y lo mantiene sincronizado con `client`.
 * Único lugar donde vive la lógica: tanto `<sx-user-menu>` como
 * `mountUserMenu()` la llaman, para no mantener dos veces el mismo DOM.
 */
export function renderUserMenu(root: ShadowRoot, client: SolvorxClient): () => void {
  const view = buildView(root)
  view.accountLink.href = client.accountUrl

  function closeMenu(): void {
    view.details.open = false
  }

  function onDocumentClick(event: MouseEvent): void {
    if (!view.details.open) return
    if (!event.composedPath().includes(view.details)) closeMenu()
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') closeMenu()
  }

  function onLogoutClick(): void {
    closeMenu()
    void client.logout()
  }

  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
  view.logoutButton.addEventListener('click', onLogoutClick)

  function applyUser(user: UserInfo | null): void {
    view.triggerAvatar.replaceChildren(
      createAvatarElement({ name: user?.name ?? '', pictureUrl: user?.picture ?? null, size: '1.75rem' }),
    )
    view.triggerName.textContent = user?.name ?? ''
    view.profileName.textContent = user?.name ?? ''
    view.profileEmail.textContent = user?.email ?? ''
    view.profileUsername.textContent = user ? `@${user.preferred_username}` : ''
  }

  function applyStatus(status: AuthStatus, user: UserInfo | null): void {
    const host = root.host as HTMLElement
    host.hidden = status !== 'authenticated'

    if (status === 'authenticated') applyUser(user)
    else closeMenu()
  }

  applyStatus(client.getStatus(), client.currentUser())
  const unsubscribe = client.subscribe(applyStatus)

  return () => {
    unsubscribe()
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onKeydown)
    view.logoutButton.removeEventListener('click', onLogoutClick)
  }
}

export interface MountUserMenuOptions {
  /** Default: el cliente registrado por el último `createSolvorxClient()`. */
  client?: SolvorxClient | null
}

/**
 * Monta el menú de usuario en `el` sin depender de que `<sx-user-menu>` esté
 * registrado como Custom Element -para integraciones que prefieren no tocar
 * `customElements`, o frameworks donde registrar un elemento global es más
 * fricción que ganancia-. Devuelve la función de desmontaje.
 */
export function mountUserMenu(el: HTMLElement, options: MountUserMenuOptions = {}): () => void {
  const client = options.client ?? getDefaultClient()

  if (!client) {
    console.warn(
      '[sx-tool-web] mountUserMenu: no hay un SolvorxClient. Pasá { client } o llamá a createSolvorxClient() antes de montar.',
    )
    return () => {}
  }

  const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
  root.replaceChildren()
  return renderUserMenu(root, client)
}

/** `<sx-user-menu>`: se oculta sola salvo que `status === 'authenticated'`. */
export class SxUserMenu extends HTMLElementBase {
  #client: SolvorxClient | null = null
  #cleanup: (() => void) | null = null

  get client(): SolvorxClient | null {
    return this.#client
  }

  set client(value: SolvorxClient | null) {
    this.#bind(value)
  }

  connectedCallback(): void {
    if (!this.#cleanup) this.#bind(this.#client ?? getDefaultClient())
  }

  disconnectedCallback(): void {
    this.#cleanup?.()
    this.#cleanup = null
  }

  #bind(client: SolvorxClient | null): void {
    this.#cleanup?.()
    this.#cleanup = null
    this.#client = client

    if (!client) {
      this.hidden = true
      return
    }

    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    root.replaceChildren()
    this.#cleanup = renderUserMenu(root, client)
  }
}
