import { getDefaultClient, type SolvorxClient } from '../core/client'
import type { AuthStatus } from '../core/state'
import { sharedStyles } from './styles'

// `globalThis.HTMLElement` (no el identificador `HTMLElement` a secas): un
// import bajo Node plano -sin jsdom, p. ej. un route handler de Next.js que
// solo usa `createSolvorxClient`, pero importa del mismo barril- no puede
// evaluar `class X extends HTMLElement` si `HTMLElement` no existe como
// global. La clase entera es igual de inutilizable en ese entorno -nadie va a
// hacer `new SxLoginButton()` fuera de un navegador-, pero el módulo tiene
// que poder *importarse* sin explotar: `registerSolvorxElements()` ya se
// guarda de no registrar nada donde no hay `customElements` (regla 11); esto
// cubre el paso anterior, que el import ni siquiera llegue a esa guarda.
const HTMLElementBase = globalThis.HTMLElement ?? (class {} as unknown as typeof HTMLElement)

const BUTTON_STYLES = `
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.5em 1em;
    border: 1px solid transparent;
    border-radius: var(--sx-radius);
    background: var(--sx-color-primary);
    color: var(--sx-color-primary-fg);
    font-weight: 600;
  }

  button:hover {
    filter: brightness(0.95);
  }

  button:focus-visible {
    outline: 2px solid var(--sx-color-primary-ink);
    outline-offset: 2px;
  }
`

/**
 * `<sx-login-button>`: redirect a `/authorize`. Se oculta sola mientras
 * `status` no sea `'unauthenticated'` -ni en `'loading'` ni en
 * `'authenticated'` tiene sentido ofrecer login-, así que alcanza con
 * ponerla en el markup: no hace falta condicionarla desde afuera.
 *
 * Atributos: `return-to` (a dónde volver tras el login) y `prompt="login"`
 * (fuerza reautenticación aunque haya sesión SSO). El texto del botón se
 * puede reemplazar con contenido en el slot por default: `<sx-login-button>Entrar</sx-login-button>`.
 */
export class SxLoginButton extends HTMLElementBase {
  #client: SolvorxClient | null = null
  #unsubscribe: (() => void) | null = null
  readonly #button: HTMLButtonElement

  constructor() {
    super()

    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = `${sharedStyles}\n${BUTTON_STYLES}`

    this.#button = document.createElement('button')
    this.#button.setAttribute('part', 'button')
    this.#button.type = 'button'
    const slot = document.createElement('slot')
    slot.textContent = 'Iniciar sesión'
    this.#button.appendChild(slot)
    this.#button.addEventListener('click', () => this.#handleClick())

    root.append(style, this.#button)
  }

  get client(): SolvorxClient | null {
    return this.#client
  }

  set client(value: SolvorxClient | null) {
    this.#bind(value)
  }

  connectedCallback(): void {
    if (!this.#client) this.#bind(getDefaultClient())
  }

  disconnectedCallback(): void {
    this.#unsubscribe?.()
    this.#unsubscribe = null
  }

  #bind(client: SolvorxClient | null): void {
    this.#unsubscribe?.()
    this.#unsubscribe = null
    this.#client = client

    if (!client) {
      this.hidden = true
      return
    }

    this.#applyStatus(client.getStatus())
    this.#unsubscribe = client.subscribe((status) => this.#applyStatus(status))
  }

  #applyStatus(status: AuthStatus): void {
    this.hidden = status !== 'unauthenticated'
  }

  #handleClick(): void {
    if (!this.#client) return

    const returnTo = this.getAttribute('return-to') ?? undefined
    const prompt = this.getAttribute('prompt') === 'login' ? ('login' as const) : undefined
    void this.#client.login({ returnTo, prompt })
  }
}
