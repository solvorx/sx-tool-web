import { describe, expect, it, vi } from 'vitest'
import { createBroadcastSessionWatcher } from './sync'

/**
 * `BroadcastChannel.postMessage` entrega de forma asíncrona vía el event
 * loop. Para el caso positivo (esperamos que llegue un mensaje) hay que
 * esperar con polling, no con una demora fija: con toda la suite corriendo
 * junta -más contención en el event loop- una sola vuelta de `setTimeout(fn,
 * 0)` no siempre alcanza, y eso hacía este test intermitente.
 */
function waitForMessage(received: unknown[]): Promise<void> {
  return vi.waitFor(() => expect(received.length).toBeGreaterThan(0), { timeout: 1000 })
}

/** Para el caso negativo (no debería llegar nada) no hay nada que hacer polling, así que alcanza con una demora fija generosa. */
function flushBroadcastChannel(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20))
}

describe('createBroadcastSessionWatcher', () => {
  it('entrega a otra instancia del mismo clientId lo que una publica', async () => {
    const a = createBroadcastSessionWatcher('sx-console-web')
    const b = createBroadcastSessionWatcher('sx-console-web')

    const received: unknown[] = []
    b.subscribe((message) => received.push(message))

    a.notify({ type: 'access-token-updated', accessToken: 'tok', expiresAt: 123 })

    await waitForMessage(received)
    expect(received).toEqual([{ type: 'access-token-updated', accessToken: 'tok', expiresAt: 123 }])

    a.close()
    b.close()
  })

  it('no entrega mensajes de un clientId distinto', async () => {
    const a = createBroadcastSessionWatcher('client-a')
    const b = createBroadcastSessionWatcher('client-b')

    const received: unknown[] = []
    b.subscribe((message) => received.push(message))

    a.notify({ type: 'signed-out' })

    await flushBroadcastChannel()
    expect(received).toEqual([])

    a.close()
    b.close()
  })

  it('deja de notificar a un listener después de desuscribirlo', async () => {
    const a = createBroadcastSessionWatcher('sx-console-web')
    const b = createBroadcastSessionWatcher('sx-console-web')

    const received: unknown[] = []
    const unsubscribe = b.subscribe((message) => received.push(message))
    unsubscribe()

    a.notify({ type: 'signed-out' })

    await flushBroadcastChannel()
    expect(received).toEqual([])

    a.close()
    b.close()
  })
})
