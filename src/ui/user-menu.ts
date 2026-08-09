import { getDefaultClient, type SolvorxSessionSource } from '../core/client'
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
    min-width: 16rem;
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

  [part='account-link'] {
    display: block;
    width: 100%;
    padding: 0.5em;
    border: none;
    border-radius: calc(var(--sx-radius) - 2px);
    text-align: left;
    margin-top: 0.25rem;
  }

  [part='account-link']:hover {
    background: color-mix(in srgb, var(--sx-color-fg) 6%, transparent);
  }

  [part='logout-here-button'],
  [part='logout-everywhere-button'] {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.125rem;
    width: 100%;
    padding: 0.5em;
    border: none;
    border-top: 1px solid var(--sx-color-border);
    border-radius: 0;
    text-align: left;
    margin-top: 0.25rem;
  }

  [part='logout-here-button']:hover,
  [part='logout-everywhere-button']:hover {
    background: color-mix(in srgb, var(--sx-color-fg) 6%, transparent);
  }

  .sx-item-title {
    font-size: 0.9em;
    font-weight: 600;
  }

  .sx-item-description {
    color: var(--sx-color-fg-muted);
    font-size: 0.8em;
  }
`

/**
 * Copy del menú. Default en español -mismo criterio que el resto del
 * paquete-, pensado para no atarse a ninguna app en particular ("esta app",
 * no "Mi cuenta"). Quien integra puede pisar cualquier subconjunto vía la
 * opción `labels` de `mountUserMenu()` o la propiedad `.labels` del elemento.
 */
export interface UserMenuLabels {
  accountLink: string
  signOutHereTitle: string
  signOutHereDescription: string
  signOutEverywhereTitle: string
  signOutEverywhereDescription: string
}

const DEFAULT_LABELS: UserMenuLabels = {
  accountLink: 'Mi cuenta',
  signOutHereTitle: 'Cerrar sesión acá',
  signOutHereDescription: 'Salís de esta app. Seguís con la sesión iniciada en el resto de las apps de SolvorX.',
  signOutEverywhereTitle: 'Cerrar sesión en todas las apps',
  signOutEverywhereDescription: 'Salís también de las demás apps de SolvorX.',
}

export interface UserMenuOptions {
  /** Pisa cualquier subconjunto de `DEFAULT_LABELS`. */
  labels?: Partial<UserMenuLabels>
  /**
   * `target` del link "Mi cuenta". Default `'_blank'` -el caso normal, cuando
   * `accountUrl` apunta a otra app. Usar `'_self'` cuando la app que integra
   * *es* la cuenta -por ejemplo, un link a la propia sección de perfil.
   */
  accountLinkTarget?: '_self' | '_blank'
}

interface UserMenuView {
  details: HTMLDetailsElement
  triggerAvatar: HTMLElement
  triggerName: HTMLElement
  profileName: HTMLElement
  profileEmail: HTMLElement
  profileUsername: HTMLElement
  accountLink: HTMLAnchorElement
  logoutHereButton: HTMLButtonElement
  logoutEverywhereButton: HTMLButtonElement
  /** Primer elemento focuseable del panel, en el orden en que aparece -a donde va el foco al abrir. */
  firstFocusable: HTMLElement
}

function buildView(root: ShadowRoot, options: UserMenuOptions): UserMenuView {
  const labels = { ...DEFAULT_LABELS, ...options.labels }

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
  accountLink.textContent = labels.accountLink
  accountLink.target = options.accountLinkTarget ?? '_blank'
  accountLink.rel = 'noopener'

  // Dos salidas separadas, con el alcance de cada una escrito -no insinuado-:
  // quien está en una máquina prestada y ve un único "cerrar sesión" se va
  // creyendo que salió de todo. Ver AGENTS.md y el comentario de
  // `core/client.ts#LogoutOptions`.
  const logoutHereButton = buildLogoutItem('logout-here-button', labels.signOutHereTitle, labels.signOutHereDescription)
  const logoutEverywhereButton = buildLogoutItem(
    'logout-everywhere-button',
    labels.signOutEverywhereTitle,
    labels.signOutEverywhereDescription,
  )

  panel.append(profile, accountLink, logoutHereButton, logoutEverywhereButton)
  details.append(summary, panel)
  root.append(style, details)

  return {
    details,
    triggerAvatar,
    triggerName,
    profileName,
    profileEmail,
    profileUsername,
    accountLink,
    logoutHereButton,
    logoutEverywhereButton,
    firstFocusable: accountLink,
  }
}

function buildLogoutItem(part: string, title: string, description: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.setAttribute('part', part)
  button.type = 'button'

  const titleEl = document.createElement('span')
  titleEl.className = 'sx-item-title'
  titleEl.textContent = title

  const descriptionEl = document.createElement('span')
  descriptionEl.className = 'sx-item-description'
  descriptionEl.textContent = description

  button.append(titleEl, descriptionEl)
  return button
}

/**
 * Arma el menú dentro de `root` y lo mantiene sincronizado con `client`.
 * Único lugar donde vive la lógica: tanto `<sx-user-menu>` como
 * `mountUserMenu()` la llaman, para no mantener dos veces el mismo DOM.
 *
 * `client` es la interfaz angosta `SolvorxSessionSource`, no `SolvorxClient`
 * completo: este componente no necesita tokens, así que también sirve para
 * una app con BFF vía `createSolvorxBffClient()`.
 */
export function renderUserMenu(root: ShadowRoot, client: SolvorxSessionSource, options: UserMenuOptions = {}): () => void {
  const view = buildView(root, options)
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

  function onToggle(): void {
    // Al abrir, el foco entra al panel: quien navega con teclado no debería
    // tener que tabular por toda la página para llegar a la primera opción.
    if (view.details.open) view.firstFocusable.focus()
  }

  function onLogoutHereClick(): void {
    closeMenu()
    void client.logout({ scope: 'here' })
  }

  function onLogoutEverywhereClick(): void {
    closeMenu()
    void client.logout({ scope: 'everywhere' })
  }

  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
  view.details.addEventListener('toggle', onToggle)
  view.logoutHereButton.addEventListener('click', onLogoutHereClick)
  view.logoutEverywhereButton.addEventListener('click', onLogoutEverywhereClick)

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
    view.details.removeEventListener('toggle', onToggle)
    view.logoutHereButton.removeEventListener('click', onLogoutHereClick)
    view.logoutEverywhereButton.removeEventListener('click', onLogoutEverywhereClick)
  }
}

export interface MountUserMenuOptions extends UserMenuOptions {
  /** Default: el cliente registrado por el último `createSolvorxClient()`. */
  client?: SolvorxSessionSource | null
}

/**
 * Monta el menú de usuario en `el` sin depender de que `<sx-user-menu>` esté
 * registrado como Custom Element -para integraciones que prefieren no tocar
 * `customElements`, o frameworks donde registrar un elemento global es más
 * fricción que ganancia-. Devuelve la función de desmontaje.
 */
export function mountUserMenu(el: HTMLElement, options: MountUserMenuOptions = {}): () => void {
  const { client: clientOption, ...renderOptions } = options
  const client = clientOption ?? getDefaultClient()

  if (!client) {
    console.warn(
      '[sx-tool-web] mountUserMenu: no hay un SolvorxClient. Pasá { client } o llamá a createSolvorxClient() antes de montar.',
    )
    return () => {}
  }

  const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
  root.replaceChildren()
  return renderUserMenu(root, client, renderOptions)
}

/** `<sx-user-menu>`: se oculta sola salvo que `status === 'authenticated'`. */
export class SxUserMenu extends HTMLElementBase {
  #client: SolvorxSessionSource | null = null
  #options: UserMenuOptions = {}
  #cleanup: (() => void) | null = null

  get client(): SolvorxSessionSource | null {
    return this.#client
  }

  set client(value: SolvorxSessionSource | null) {
    this.#client = value
    this.#bind()
  }

  get labels(): Partial<UserMenuLabels> | undefined {
    return this.#options.labels
  }

  set labels(value: Partial<UserMenuLabels> | undefined) {
    this.#options = { ...this.#options, labels: value }
    this.#bind()
  }

  get accountLinkTarget(): '_self' | '_blank' | undefined {
    return this.#options.accountLinkTarget
  }

  set accountLinkTarget(value: '_self' | '_blank' | undefined) {
    this.#options = { ...this.#options, accountLinkTarget: value }
    this.#bind()
  }

  connectedCallback(): void {
    if (!this.#cleanup) this.#bind(this.#client ?? getDefaultClient())
  }

  disconnectedCallback(): void {
    this.#cleanup?.()
    this.#cleanup = null
  }

  #bind(client: SolvorxSessionSource | null = this.#client): void {
    this.#cleanup?.()
    this.#cleanup = null
    this.#client = client

    if (!client) {
      this.hidden = true
      return
    }

    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    root.replaceChildren()
    this.#cleanup = renderUserMenu(root, client, this.#options)
  }
}
