/**
 * ¿Este error es «el Authorization Server ya no reconoce esta sesión»?
 *
 * Estructural y no `instanceof`: cada BFF normaliza con su propia clase
 * (`StandardError` en account/console, `SolvorxError` acá), así que el
 * `isUnauthorized()` de `../http/error` -que exige `SolvorxError.is()`- dejaría
 * afuera justo los errores de las apps que consumen esto. `status` es lo único
 * que las tres formas comparten.
 *
 * Excepción: un error marcado `isMachinePlane: true` (hoy solo lo produce
 * `sx-account-web/src/lib/api/payment.ts`, contra sx-payment-service) es un 401
 * de un cliente que habla como MÁQUINA -consumer token + API key de proyecto-,
 * no con el token de la persona. No dice nada sobre su sesión -puede ser
 * simplemente una API key vieja- así que no cuenta como sesión revocada.
 */
export function isRevokedSessionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  const candidate = error as { status?: unknown; isMachinePlane?: unknown }
  return candidate.status === 401 && candidate.isMachinePlane !== true
}

/**
 * Envuelve la carga de datos de un Server Component. El 401 lo resuelve
 * `onRevoked` (borrar la sesión local + redirigir); todo lo demás se relanza
 * intacto — incluido el `NEXT_REDIRECT` de un `redirect()` hecho adentro de
 * `load`, que lleva `digest` y no `status`.
 */
export async function withSessionRecovery<T>(
  load: () => Promise<T>,
  onRevoked: (error: unknown) => Promise<never>,
): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (!isRevokedSessionError(error)) throw error
    return await onRevoked(error)
  }
}
