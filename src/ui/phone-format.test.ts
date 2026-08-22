import { describe, expect, it } from 'vitest'
import { joinPhoneNumber, splitPhoneNumber } from './phone-format'

describe('splitPhoneNumber', () => {
  it('separa el prefijo del número nacional', () => {
    expect(splitPhoneNumber('+595981123456')).toEqual({
      countryIso2: 'PY',
      nationalNumber: '981123456',
    })
  })

  it('tolera espacios, guiones y paréntesis del valor guardado', () => {
    expect(splitPhoneNumber('+595 (981) 123-456')).toEqual({
      countryIso2: 'PY',
      nationalNumber: '981123456',
    })
  })

  /**
   * `+1809` tiene que ganarle a `+1`. Sin el orden por longitud, un número
   * dominicano se mostraría como estadounidense con el 809 pegado al número.
   */
  it('elige el prefijo más largo que matchee', () => {
    expect(splitPhoneNumber('+18095551234')).toEqual({
      countryIso2: 'DO',
      nationalNumber: '5551234',
    })
    expect(splitPhoneNumber('+15551234567')).toEqual({
      countryIso2: 'US',
      nationalNumber: '5551234567',
    })
  })

  it('usa el país por defecto cuando no hay valor', () => {
    expect(splitPhoneNumber(null)).toEqual({ countryIso2: 'PY', nationalNumber: '' })
    expect(splitPhoneNumber('')).toEqual({ countryIso2: 'PY', nationalNumber: '' })
  })

  /**
   * Un número que no matchea ningún prefijo conocido no se descarta: abrir el
   * formulario no puede borrar lo que la persona ya tenía guardado.
   */
  it('conserva los dígitos cuando no reconoce el prefijo', () => {
    expect(splitPhoneNumber('0981123456')).toEqual({
      countryIso2: 'PY',
      nationalNumber: '0981123456',
    })
  })
})

describe('joinPhoneNumber', () => {
  it('arma el formato que guarda el backend', () => {
    expect(joinPhoneNumber('PY', '981123456')).toBe('+595981123456')
  })

  it('limpia la separación que haya tipeado la persona', () => {
    expect(joinPhoneNumber('PY', '981 123-456')).toBe('+595981123456')
  })

  it('devuelve vacío sin número nacional, nunca el prefijo suelto', () => {
    expect(joinPhoneNumber('PY', '')).toBe('')
    expect(joinPhoneNumber('PY', '   ')).toBe('')
  })
})

describe('ida y vuelta', () => {
  it.each(['+595981123456', '+5491123456789', '+15551234567', '+18095551234'])(
    'reconstruye %s',
    (stored) => {
      const { countryIso2, nationalNumber } = splitPhoneNumber(stored)
      expect(joinPhoneNumber(countryIso2, nationalNumber)).toBe(stored)
    },
  )
})
