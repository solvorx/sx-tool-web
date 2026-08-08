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
    --sx-color-danger: #dc2626;
    --sx-radius: 8px;
    --sx-spacing: 0.5rem;

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
    color: var(--sx-color-primary);
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
