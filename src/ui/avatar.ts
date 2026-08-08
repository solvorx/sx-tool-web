/**
 * Foto de perfil, con las iniciales como respaldo. Puerto de
 * `sx-account-web/src/components/user-avatar.tsx` a DOM plano: mismo
 * comportamiento (la URL puede estar rota, privada, o haber dejado de
 * existir; un `<img>` fallado no puede quedar mostrando el ícono roto del
 * navegador), sin el estado de React -acá el propio evento `error` del
 * `<img>` dispara el reemplazo.
 */

/** `Ana López` → `AL`. Una sola letra si no hay apellido. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'

  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''

  return (first + last).toUpperCase()
}

function createInitials(name: string): HTMLElement {
  const initials = document.createElement('span')
  initials.setAttribute('aria-hidden', 'true')
  initials.textContent = initialsOf(name)
  return initials
}

export function createAvatarElement(input: { name: string; pictureUrl?: string | null; size?: string }): HTMLElement {
  const span = document.createElement('span')
  span.className = 'sx-avatar'
  span.style.width = input.size ?? '2rem'
  span.style.height = input.size ?? '2rem'

  if (input.pictureUrl) {
    const img = document.createElement('img')
    img.className = 'sx-avatar-image'
    img.src = input.pictureUrl
    img.alt = ''
    img.addEventListener('error', () => {
      img.remove()
      span.appendChild(createInitials(input.name))
    })
    span.appendChild(img)
  } else {
    span.appendChild(createInitials(input.name))
  }

  return span
}
