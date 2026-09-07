import { getDefaultClient, type SolvorxSessionSource } from '../core/client'
import type { AuthStatus, SessionUser } from '../core/state'
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
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    background: color-mix(in srgb, var(--sx-color-fg) 6%, transparent);
  }

  summary:focus-visible {
    outline: 2px solid var(--sx-color-primary-ink);
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
    /* El shadow root no crea su propio stacking context: este panel compite
       en el del *host* page, no en uno propio. Sin z-index explícito pinta
       en 'auto' y pierde contra cualquier elemento posicionado que aparezca
       después en el DOM de la app que integra (p.ej. un modal, otro
       dropdown). --sx-z-panel vive en styles.ts -ver el comentario ahí
       sobre por qué es una custom property y no un valor fijo acá-. */
    z-index: var(--sx-z-panel, 100);
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

  [part='logout-everywhere-button'] {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.125rem;
    width: 100%;
    padding: 0.5em;
    text-align: left;
    border: 1px solid color-mix(in srgb, var(--sx-color-danger) 40%, transparent);
    border-radius: calc(var(--sx-radius) - 2px);
    color: var(--sx-color-danger);
    margin-top: 0.5rem;
  }

  [part='logout-everywhere-button']:hover {
    background: color-mix(in srgb, var(--sx-color-danger) 8%, transparent);
    border-color: color-mix(in srgb, var(--sx-color-danger) 70%, transparent);
  }

  /* La descripción gris suelta lee como si no fuera parte del mismo control. */
  [part='logout-everywhere-button'] .sx-item-description {
    color: color-mix(in srgb, var(--sx-color-danger) 70%, var(--sx-color-fg-muted));
  }

  /* renderUserMenu() mueve el foco al panel al abrir (:265-269) pero ningún ítem
     del panel tenía :focus-visible - solo summary (:34-37). */
  [part='account-link']:focus-visible,
  [part='logout-everywhere-button']:focus-visible {
    outline: 2px solid var(--sx-color-primary-ink);
    outline-offset: 2px;
  }

  .sx-item-title {
    font-size: 0.9em;
    font-weight: 600;
  }

  .sx-item-description {
    color: var(--sx-color-fg-muted);
    font-size: 0.8em;
  }

  [part='theme'] {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem;
    margin-top: 0.25rem;
    border-radius: calc(var(--sx-radius) - 2px);
  }

  [part='theme-option'] {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: calc(var(--sx-radius) - 4px);
    color: var(--sx-color-fg-muted);
  }

  [part='theme-option']:hover {
    background: color-mix(in srgb, var(--sx-color-fg) 6%, transparent);
    color: var(--sx-color-fg);
  }

  [part='theme-option'][aria-checked='true'] {
    background: color-mix(in srgb, var(--sx-color-fg) 8%, transparent);
    color: var(--sx-color-fg);
  }

  [part='theme-option']:focus-visible {
    outline: 2px solid var(--sx-color-primary-ink);
    outline-offset: 2px;
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
  signOutEverywhereTitle: string
  signOutEverywhereDescription: string
}

const DEFAULT_LABELS: UserMenuLabels = {
  accountLink: 'Mi cuenta',
  signOutEverywhereTitle: 'Cerrar sesión en todas las apps',
  signOutEverywhereDescription: 'Salís también de las demás apps de SolvorX.',
}

export type SxTheme = 'light' | 'dark' | 'system'

export interface UserMenuThemeLabels {
  label: string
  light: string
  dark: string
  system: string
}

const DEFAULT_THEME_LABELS: UserMenuThemeLabels = {
  label: 'Tema',
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
}

export interface UserMenuThemeOptions {
  /** Preferencia de tema al montar. Cambios posteriores los maneja el menú solo -ver `renderUserMenu`-. */
  value: SxTheme
  /** La app persiste (p.ej. la cookie `sx_theme`) y aplica el tema nuevo. */
  onChange: (theme: SxTheme) => void
  /** Pisa cualquier subconjunto de `DEFAULT_THEME_LABELS`. */
  labels?: Partial<UserMenuThemeLabels>
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
  /**
   * Sin esta opción no se renderiza la sección de tema -el paquete sigue
   * sirviendo a integraciones que no tienen tema-.
   */
  theme?: UserMenuThemeOptions
}

/**
 * Mismo trazo que los íconos de lucide-react (`Sun`/`Moon`/`Monitor`) que
 * usaba el `ThemeToggle` de la consola -ver AGENTS.md-, copiados a mano
 * porque el paquete es `dependencies: {}` y DOM plano.
 */
const THEME_ICONS: Record<SxTheme, string> = {
  light:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  dark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>',
  system:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>',
}

const THEME_ORDER: readonly SxTheme[] = ['light', 'dark', 'system']

interface ThemeGroupView {
  group: HTMLElement
  buttons: Record<SxTheme, HTMLButtonElement>
}

function buildThemeGroup(options: UserMenuThemeOptions): ThemeGroupView {
  const labels = { ...DEFAULT_THEME_LABELS, ...options.labels }

  const group = document.createElement('div')
  group.setAttribute('part', 'theme')
  group.setAttribute('role', 'radiogroup')
  group.setAttribute('aria-label', labels.label)

  const buttons = {} as Record<SxTheme, HTMLButtonElement>

  for (const value of THEME_ORDER) {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('part', 'theme-option')
    button.setAttribute('role', 'radio')
    button.setAttribute('aria-checked', String(value === options.value))
    button.setAttribute('aria-label', labels[value])
    button.innerHTML = THEME_ICONS[value]
    buttons[value] = button
    group.appendChild(button)
  }

  return { group, buttons }
}

interface UserMenuView {
  details: HTMLDetailsElement
  triggerAvatar: HTMLElement
  triggerName: HTMLElement
  profileName: HTMLElement
  profileEmail: HTMLElement
  profileUsername: HTMLElement
  accountLink: HTMLAnchorElement
  theme: ThemeGroupView | null
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

  // Una sola salida, global: cerrar sesión significa salir del dispositivo,
  // no de "esta app". Ver AGENTS.md y el comentario de
  // `core/client.ts#LogoutOptions`.
  const logoutEverywhereButton = buildLogoutItem(
    'logout-everywhere-button',
    labels.signOutEverywhereTitle,
    labels.signOutEverywhereDescription,
  )

  // Grupo de tema entre el link de cuenta y la acción destructiva -que queda
  // última-. Sin `options.theme` no se renderiza: el paquete sigue
  // sirviendo a integraciones que no tienen tema.
  const themeGroup = options.theme ? buildThemeGroup(options.theme) : null

  panel.append(profile, accountLink, ...(themeGroup ? [themeGroup.group] : []), logoutEverywhereButton)
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
    theme: themeGroup,
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

  function onLogoutEverywhereClick(): void {
    closeMenu()
    void client.logout({ scope: 'everywhere' })
  }

  // El menú se queda con el seleccionado -inicializado con `theme.value` en
  // `buildThemeGroup()`, actualizado acá antes de llamar a `onChange`-: es el
  // único control de tema después de este cambio, así que no hace falta que
  // la app vuelva a pisar la opción `theme` para reflejar un click. El panel
  // NO se cierra -`onDocumentClick` ya ignora todo lo que esté dentro de
  // `view.details`, y acá no se llama a `closeMenu()`-.
  const onThemeOptionClicks: Array<[HTMLButtonElement, () => void]> = []
  if (view.theme && options.theme) {
    const themeGroup = view.theme
    const themeOptions = options.theme
    for (const value of THEME_ORDER) {
      const button = themeGroup.buttons[value]
      const onClick = (): void => {
        for (const [otherValue, otherButton] of Object.entries(themeGroup.buttons) as [SxTheme, HTMLButtonElement][]) {
          otherButton.setAttribute('aria-checked', String(otherValue === value))
        }
        themeOptions.onChange(value)
      }
      button.addEventListener('click', onClick)
      onThemeOptionClicks.push([button, onClick])
    }
  }

  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
  view.details.addEventListener('toggle', onToggle)
  view.logoutEverywhereButton.addEventListener('click', onLogoutEverywhereClick)

  function applyUser(user: SessionUser | null): void {
    view.triggerAvatar.replaceChildren(
      createAvatarElement({ name: user?.name ?? '', pictureUrl: user?.picture ?? null, size: '1.75rem' }),
    )
    view.triggerName.textContent = user?.name ?? ''
    view.profileName.textContent = user?.name ?? ''
    view.profileEmail.textContent = user?.email ?? ''
    view.profileUsername.textContent = user ? `@${user.preferred_username}` : ''
  }

  function applyStatus(status: AuthStatus, user: SessionUser | null): void {
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
    view.logoutEverywhereButton.removeEventListener('click', onLogoutEverywhereClick)
    for (const [button, onClick] of onThemeOptionClicks) button.removeEventListener('click', onClick)
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

  get theme(): UserMenuThemeOptions | undefined {
    return this.#options.theme
  }

  set theme(value: UserMenuThemeOptions | undefined) {
    this.#options = { ...this.#options, theme: value }
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
