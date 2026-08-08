import { describe, expect, it, vi } from 'vitest'
import { createStore } from './state'
import type { UserInfo } from '../oauth/endpoints'

const USER = { name: 'Ana', email: 'ana@x.com' } as UserInfo

describe('createStore', () => {
  it('getState() devuelve el estado inicial', () => {
    const store = createStore({ status: 'loading', user: null })
    expect(store.getState()).toEqual({ status: 'loading', user: null })
  })

  it('setState hace merge parcial, sin pisar las claves que no se pasan', () => {
    const store = createStore({ status: 'loading', user: null })

    store.setState({ status: 'authenticated', user: USER })
    expect(store.getState()).toEqual({ status: 'authenticated', user: USER })

    store.setState({ status: 'unauthenticated' })
    // `user` no se pasó en este setState: tiene que sobrevivir del estado anterior... salvo
    // que la intención sea limpiarlo, en cuyo caso quien llama lo pasa explícito.
    expect(store.getState()).toEqual({ status: 'unauthenticated', user: USER })
  })

  it('subscribe recibe (status, user) en cada setState', () => {
    const store = createStore({ status: 'loading', user: null })
    const listener = vi.fn()
    store.subscribe(listener)

    store.setState({ status: 'authenticated', user: USER })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('authenticated', USER)
  })

  it('la desuscripción corta las notificaciones futuras', () => {
    const store = createStore({ status: 'loading', user: null })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.setState({ status: 'authenticated', user: USER })

    expect(listener).not.toHaveBeenCalled()
  })

  it('varios listeners reciben la misma notificación', () => {
    const store = createStore({ status: 'loading', user: null })
    const first = vi.fn()
    const second = vi.fn()
    store.subscribe(first)
    store.subscribe(second)

    store.setState({ status: 'unauthenticated', user: null })

    expect(first).toHaveBeenCalledWith('unauthenticated', null)
    expect(second).toHaveBeenCalledWith('unauthenticated', null)
  })
})
