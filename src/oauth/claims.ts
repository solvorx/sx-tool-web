/**
 * Lectura de los claims del access token.
 *
 * Se decodifica **sin verificar la firma**, y está bien: nada de acá se usa
 * para autorizar. Quien decide es el backend, que sí valida contra el JWKS.
 * Acá los claims sirven para dos cosas de presentación: saber cuándo conviene
 * renovar (`exp`) y marcar cuál de las sesiones listadas es la de este
 * navegador (`sid`).
 *
 * Tratar un claim como permiso sería confiar en un valor que cualquiera puede
 * reescribir en las devtools.
 */

export interface AccessTokenClaims {
  /** `code` del usuario, o `globalCode` del consumer — nunca el id interno. */
  sub: string
  /** Id de la sesión de proyecto. */
  sid: number
  /** Código del proyecto, derivado del cliente OAuth del lado del servidor. */
  pCode: string | null
  /** Vencimiento, en segundos epoch. */
  exp: number | null
  roles: string[]
}

function decodeSegment(segment: string): unknown {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))

  // `atob` devuelve latin-1: sin este paso, un nombre con acentos en el token
  // se rompe. `escape` está deprecado pero es lo que hay sin dependencias.
  const utf8 = decodeURIComponent(
    Array.from(json, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
  )

  return JSON.parse(utf8)
}

/** Decodifica el payload. Devuelve `null` si el token no es un JWT legible. */
export function readAccessTokenClaims(token: string): AccessTokenClaims | null {
  const payload = token.split('.')[1]
  if (!payload) return null

  try {
    const decoded = decodeSegment(payload)
    if (typeof decoded !== 'object' || decoded === null) return null

    const claims = decoded as Record<string, unknown>
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'number') return null

    return {
      sub: claims.sub,
      sid: claims.sid,
      pCode: typeof claims.pCode === 'string' ? claims.pCode : null,
      exp: typeof claims.exp === 'number' ? claims.exp : null,
      roles: Array.isArray(claims.roles) ? claims.roles.filter((r): r is string => typeof r === 'string') : [],
    }
  } catch {
    return null
  }
}
