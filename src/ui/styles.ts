/**
 * Theming por CSS custom properties: la app que integra el paquete las
 * sobrescribe desde fuera (`sx-user-menu { --sx-color-primary: ...; }`) sin
 * tocar el Shadow DOM -las custom properties SÍ atraviesan el shadow
 * boundary, a diferencia de cualquier otro estilo-. Los `part` de cada
 * componente son el otro medio de theming, para estilos que una variable no
 * alcanza a cubrir (`sx-user-menu::part(trigger) { ... }`).
 */
export const sharedStyles = `
  :host {
    --sx-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    --sx-color-fg: #0f172a;
    --sx-color-fg-muted: #64748b;
    --sx-color-bg: #ffffff;
    --sx-color-border: #e2e8f0;
    --sx-color-primary: #4f46e5;
    --sx-color-primary-fg: #ffffff;
    /*
     * OJO: este archivo es un template literal de TS. Nada de backticks acá
     * adentro -cortan el string y el error que tira tsc no apunta al comentario.
     *
     * El color de marca cumple DOS roles que piden luminosidades opuestas:
     * RELLENO (fondo del login-button, con --sx-color-primary-fg encima) y
     * TINTA (iniciales del avatar, anillos de foco). Con una marca oscura como
     * el azul de SolvorX un solo valor sirve para las dos, y por eso esto vino
     * junto hasta ahora; con una marca clara no: el mismo teal que se lee bien
     * de fondo da 2.3:1 como texto.
     *
     * Por defecto hereda --sx-color-primary, así que las integraciones que no
     * lo seteen se comportan exactamente igual que antes. Una marca clara pisa
     * solo esta y deja el relleno intacto.
     */
    --sx-color-primary-ink: var(--sx-color-primary);
    --sx-color-danger: #dc2626;
    --sx-radius: 8px;
    --sx-spacing: 0.5rem;
    /* z-index del panel desplegable (user-menu.ts, part='panel'), expuesto
       como custom property -y no hardcodeado en la regla- porque las custom
       properties SÍ atraviesan el shadow boundary: la app que integra puede
       pisar este valor si su propio stacking context lo exige, sin esperar
       un release nuevo del paquete. */
    --sx-z-panel: 100;

    font-family: var(--sx-font-family);
    color: var(--sx-color-fg);
    font-size: 14px;
    line-height: 1.4;
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --sx-color-fg: #f1f5f9;
      --sx-color-fg-muted: #94a3b8;
      --sx-color-bg: #0f172a;
      --sx-color-border: #1e293b;
      --sx-color-danger: #f87171;
    }
  }

  :host([hidden]) {
    display: none;
  }

  * {
    box-sizing: border-box;
  }

  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
    /* Sin esto, cualquier regla de part que no declare background cae al
       ButtonFace gris del user agent en vez de heredar el fondo del host. */
    background: transparent;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  .sx-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--sx-color-primary) 15%, transparent);
    color: var(--sx-color-primary-ink);
    font-weight: 600;
    user-select: none;
    flex-shrink: 0;
  }

  .sx-avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`
