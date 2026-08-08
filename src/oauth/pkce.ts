/**
 * PKCE (RFC 7636). Web Crypto puro (`crypto.getRandomValues` / `crypto.subtle`),
 * disponible en todo navegador que soporta ES2022 — sin esto no hay canje de
 * código posible para un cliente público.
 */

/** El RFC pide entre 43 y 128 caracteres. 32 bytes en base64url dan 43. */
const VERIFIER_BYTES = 32

function randomBase64Url(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return base64UrlEncode(buffer)
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** `code_verifier`: el secreto que se queda en este origen hasta el canje. */
export function createCodeVerifier(): string {
  return randomBase64Url(VERIFIER_BYTES)
}

/**
 * `state`: valor opaco contra CSRF. El backend lo devuelve tal cual en el
 * callback y **hay que compararlo** antes de canjear el código; sin eso,
 * cualquiera puede inyectar un código ajeno en esta sesión.
 */
export function createState(): string {
  return randomBase64Url(16)
}

/** `code_challenge` = base64url(sha256(verifier)). */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}
