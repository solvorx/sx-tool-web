import { describe, expect, it } from 'vitest'
import { createAvatarElement, initialsOf } from './avatar'

describe('initialsOf', () => {
  it('toma la primera letra del nombre y del apellido', () => {
    expect(initialsOf('Ana López')).toBe('AL')
  })

  it('usa una sola letra si no hay apellido', () => {
    expect(initialsOf('Ana')).toBe('A')
  })

  it('devuelve "?" ante un nombre vacío', () => {
    expect(initialsOf('   ')).toBe('?')
  })

  it('ignora espacios repetidos', () => {
    expect(initialsOf('  Ana   María   López  ')).toBe('AL')
  })
})

describe('createAvatarElement', () => {
  it('sin pictureUrl, muestra las iniciales directamente', () => {
    const el = createAvatarElement({ name: 'Ana López' })

    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toBe('AL')
  })

  it('con pictureUrl, muestra la imagen y cae a las iniciales si falla', () => {
    const el = createAvatarElement({ name: 'Ana López', pictureUrl: 'https://example.com/broken.jpg' })

    const img = el.querySelector('img')
    expect(img).not.toBeNull()
    expect(el.textContent).toBe('')

    img?.dispatchEvent(new Event('error'))

    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toBe('AL')
  })
})
