import { COUNTRIES, DEFAULT_COUNTRY_ISO2, DIAL_CODES_BY_LENGTH, type Country } from './phone-countries'

/**
 * El backend guarda **un solo string** en `User.phoneNumber` (`+595981123456`) y
 * lo compara con `findUnique` después de sacarle espacios y guiones. El selector
 * de país es solo presentación: acá se parte para mostrarlo y se vuelve a unir
 * para mandarlo.
 */

/** `VarChar(50)` en la base. El prefijo entra en ese presupuesto. */
export const PHONE_MAX_LENGTH = 50

export interface SplitPhone {
  /** `iso2` del país elegido — no el prefijo, porque `+1` lo comparten varios. */
  countryIso2: string
  nationalNumber: string
}

export function findCountry(iso2: string): Country | undefined {
  return COUNTRIES.find((country) => country.iso2 === iso2)
}

export function dialCodeOf(iso2: string): string {
  return findCountry(iso2)?.dialCode ?? ''
}

/**
 * Parte un número guardado en país + número nacional.
 *
 * Si no matchea ningún prefijo —un número viejo cargado a mano, o de un país que
 * no está en la lista— devuelve el país por defecto y **el valor tal cual**. Es
 * deliberado: perder los dígitos al abrir el formulario sería peor que mostrar
 * un país equivocado que la persona puede corregir.
 */
export function splitPhoneNumber(value: string | null | undefined): SplitPhone {
  const normalized = (value ?? '').trim().replace(/[\s()-]/g, '')

  if (!normalized) {
    return { countryIso2: DEFAULT_COUNTRY_ISO2, nationalNumber: '' }
  }

  // Del prefijo más largo al más corto: ver DIAL_CODES_BY_LENGTH.
  const match = DIAL_CODES_BY_LENGTH.find((country) => normalized.startsWith(country.dialCode))

  if (!match) {
    return { countryIso2: DEFAULT_COUNTRY_ISO2, nationalNumber: normalized }
  }

  return { countryIso2: match.iso2, nationalNumber: normalized.slice(match.dialCode.length) }
}

/**
 * Une país + número nacional en el formato que guarda el backend.
 *
 * Sin número nacional devuelve cadena vacía y no el prefijo suelto: `+595` no es
 * un teléfono, y mandarlo sería guardar basura que además ocupa el índice único.
 */
export function joinPhoneNumber(countryIso2: string, nationalNumber: string): string {
  const national = nationalNumber.replace(/[\s()-]/g, '')
  if (!national) return ''

  return `${dialCodeOf(countryIso2)}${national}`
}
