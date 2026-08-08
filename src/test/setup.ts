/**
 * jsdom no implementa `navigator.locks` ni siempre `BroadcastChannel`. Los
 * fakes de acá alcanzan para lo único que los tests necesitan probar: que un
 * lock con el mismo nombre serializa a quien lo pide después, y que un
 * `BroadcastChannel` del mismo nombre entrega los mensajes que postea otro.
 * No son polyfills de producción — el paquete en sí no trae ninguno, porque
 * ambas APIs son nativas en todo navegador que soporta ES2022.
 */

class FakeLock {
  constructor(
    readonly name: string,
    readonly mode: 'exclusive' | 'shared',
  ) {}
}

class FakeLockManager {
  private tails = new Map<string, Promise<unknown>>()

  async request<T>(name: string, callback: (lock: FakeLock) => T | PromiseLike<T>): Promise<T> {
    const previous = this.tails.get(name) ?? Promise.resolve()
    const run = previous.catch(() => {}).then(() => callback(new FakeLock(name, 'exclusive')))
    this.tails.set(
      name,
      run.catch(() => {}),
    )
    return run
  }
}

if (typeof navigator !== 'undefined' && !('locks' in navigator)) {
  Object.defineProperty(navigator, 'locks', {
    value: new FakeLockManager(),
    configurable: true,
  })
}

if (typeof BroadcastChannel === 'undefined') {
  const channels = new Map<string, Set<FakeBroadcastChannel>>()

  class FakeBroadcastChannel {
    onmessage: ((event: MessageEvent) => void) | null = null

    constructor(readonly name: string) {
      const peers = channels.get(name) ?? new Set()
      peers.add(this)
      channels.set(name, peers)
    }

    postMessage(data: unknown): void {
      const peers = channels.get(this.name) ?? new Set()
      for (const peer of peers) {
        if (peer === this) continue
        peer.onmessage?.({ data } as MessageEvent)
      }
    }

    close(): void {
      channels.get(this.name)?.delete(this)
    }

    addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
      this.onmessage = listener
    }

    removeEventListener(): void {
      this.onmessage = null
    }
  }

  // @ts-expect-error -- fake mínimo, no implementa la interfaz completa de EventTarget
  globalThis.BroadcastChannel = FakeBroadcastChannel
}
