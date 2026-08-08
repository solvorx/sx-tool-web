/**
 * Sincronización entre pestañas del mismo origen.
 *
 * Al refrescar, desloguear o rehidratar, `core/client.ts` avisa por acá para
 * que las otras pestañas actualicen su propio caché en memoria (`current` de
 * `session/refresh.ts`) en vez de disparar su propio refresh o quedarse con
 * estado viejo hasta su próxima llamada.
 *
 * `SessionWatcher` es la interfaz -no `BroadcastChannel` directo- porque el
 * transporte cross-origin queda fuera de este plan (ver README): el día que
 * exista un canal SSE del backend, entra como otra implementación de esta
 * misma interfaz, sin tocar la API pública del cliente.
 */

export type SessionSyncMessage =
  | { type: 'access-token-updated'; accessToken: string; expiresAt: number }
  | { type: 'signed-out' }

export interface SessionWatcher {
  notify(message: SessionSyncMessage): void
  subscribe(listener: (message: SessionSyncMessage) => void): () => void
  close(): void
}

/** Única implementación de hoy: mismo origen, vía `BroadcastChannel`. */
export function createBroadcastSessionWatcher(clientId: string): SessionWatcher {
  const channel = new BroadcastChannel(`sx-session:${clientId}`)
  const listeners = new Set<(message: SessionSyncMessage) => void>()

  channel.onmessage = (event: MessageEvent<SessionSyncMessage>) => {
    for (const listener of listeners) listener(event.data)
  }

  return {
    notify(message) {
      channel.postMessage(message)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      channel.close()
      listeners.clear()
    },
  }
}
