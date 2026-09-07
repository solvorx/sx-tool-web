/**
 * Lo que `<sx-user-menu>` de verdad lee de un usuario -ver `applyUser()` en
 * `ui/user-menu.ts`-. Subconjunto estructural de `UserInfo`
 * (`oauth/endpoints.ts`): cualquier `UserInfo` la satisface sin cambios, así
 * que un BFF que ya resuelve la sesión con `readAccessTokenClaims()` no
 * necesita inventar un `project` falso ni pagar un `userinfo()` extra por
 * render solo para tipar `user`.
 */
export interface SessionUser {
  sub: string
  name: string
  preferred_username: string
  email: string
  picture?: string
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface ClientState {
  status: AuthStatus
  user: SessionUser | null
}

export type StateListener = (status: AuthStatus, user: SessionUser | null) => void

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
