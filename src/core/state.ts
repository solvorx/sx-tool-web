import type { UserInfo } from '../oauth/endpoints'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface ClientState {
  status: AuthStatus
  user: UserInfo | null
}

export type StateListener = (status: AuthStatus, user: UserInfo | null) => void

export interface Store {
  getState(): ClientState
  setState(next: Partial<ClientState>): void
  subscribe(listener: StateListener): () => void
}

/** Store mínimo: sin selectors ni middlewares, el cliente solo necesita un valor y notificar cambios. */
export function createStore(initial: ClientState): Store {
  let state = initial
  const listeners = new Set<StateListener>()

  return {
    getState: () => state,
    setState(next) {
      state = { ...state, ...next }
      for (const listener of listeners) listener(state.status, state.user)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
