/**
 * Países con su prefijo telefónico, para el selector de `PhoneField`.
 *
 * No hay dependencia de `libphonenumber-js` ni equivalentes a propósito: pesan
 * cientos de KB para validar formatos nacionales, y acá el teléfono es un
 * identificador de login, no un dato de facturación. Lo único que necesitamos
 * es el prefijo y una lista para elegirlo.
 *
 * El orden no es alfabético puro: primero Paraguay y la región, que es de donde
 * viene la gente que usa esto. Un selector alfabético dejaría a Paraguay entre
 * Panamá y Perú, a 150 opciones del principio.
 *
 * `iso2` está porque dos países pueden compartir prefijo (`+1` es US, CA y
 * varios del Caribe) y el `value` del `<option>` tiene que ser único.
 */
export interface Country {
  iso2: string
  name: string
  dialCode: string
  flag: string
}

/** Preseleccionado cuando no hay número previo. */
export const DEFAULT_COUNTRY_ISO2 = 'PY'

export const COUNTRIES: Country[] = [
  { iso2: 'PY', name: 'Paraguay', dialCode: '+595', flag: '🇵🇾' },
  { iso2: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { iso2: 'BR', name: 'Brasil', dialCode: '+55', flag: '🇧🇷' },
  { iso2: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { iso2: 'BO', name: 'Bolivia', dialCode: '+591', flag: '🇧🇴' },
  { iso2: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { iso2: 'PE', name: 'Perú', dialCode: '+51', flag: '🇵🇪' },
  { iso2: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { iso2: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨' },
  { iso2: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
  { iso2: 'MX', name: 'México', dialCode: '+52', flag: '🇲🇽' },
  { iso2: 'US', name: 'Estados Unidos', dialCode: '+1', flag: '🇺🇸' },
  { iso2: 'ES', name: 'España', dialCode: '+34', flag: '🇪🇸' },

  { iso2: 'DE', name: 'Alemania', dialCode: '+49', flag: '🇩🇪' },
  { iso2: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { iso2: 'AT', name: 'Austria', dialCode: '+43', flag: '🇦🇹' },
  { iso2: 'BE', name: 'Bélgica', dialCode: '+32', flag: '🇧🇪' },
  { iso2: 'CA', name: 'Canadá', dialCode: '+1', flag: '🇨🇦' },
  { iso2: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
  { iso2: 'KR', name: 'Corea del Sur', dialCode: '+82', flag: '🇰🇷' },
  { iso2: 'CR', name: 'Costa Rica', dialCode: '+506', flag: '🇨🇷' },
  { iso2: 'CU', name: 'Cuba', dialCode: '+53', flag: '🇨🇺' },
  { iso2: 'DK', name: 'Dinamarca', dialCode: '+45', flag: '🇩🇰' },
  { iso2: 'SV', name: 'El Salvador', dialCode: '+503', flag: '🇸🇻' },
  { iso2: 'FR', name: 'Francia', dialCode: '+33', flag: '🇫🇷' },
  { iso2: 'GT', name: 'Guatemala', dialCode: '+502', flag: '🇬🇹' },
  { iso2: 'HN', name: 'Honduras', dialCode: '+504', flag: '🇭🇳' },
  { iso2: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { iso2: 'IE', name: 'Irlanda', dialCode: '+353', flag: '🇮🇪' },
  { iso2: 'IL', name: 'Israel', dialCode: '+972', flag: '🇮🇱' },
  { iso2: 'IT', name: 'Italia', dialCode: '+39', flag: '🇮🇹' },
  { iso2: 'JP', name: 'Japón', dialCode: '+81', flag: '🇯🇵' },
  { iso2: 'MA', name: 'Marruecos', dialCode: '+212', flag: '🇲🇦' },
  { iso2: 'NI', name: 'Nicaragua', dialCode: '+505', flag: '🇳🇮' },
  { iso2: 'NO', name: 'Noruega', dialCode: '+47', flag: '🇳🇴' },
  { iso2: 'NZ', name: 'Nueva Zelanda', dialCode: '+64', flag: '🇳🇿' },
  { iso2: 'NL', name: 'Países Bajos', dialCode: '+31', flag: '🇳🇱' },
  { iso2: 'PA', name: 'Panamá', dialCode: '+507', flag: '🇵🇦' },
  { iso2: 'PL', name: 'Polonia', dialCode: '+48', flag: '🇵🇱' },
  { iso2: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { iso2: 'GB', name: 'Reino Unido', dialCode: '+44', flag: '🇬🇧' },
  { iso2: 'CZ', name: 'República Checa', dialCode: '+420', flag: '🇨🇿' },
  { iso2: 'DO', name: 'República Dominicana', dialCode: '+1809', flag: '🇩🇴' },
  { iso2: 'RO', name: 'Rumania', dialCode: '+40', flag: '🇷🇴' },
  { iso2: 'RU', name: 'Rusia', dialCode: '+7', flag: '🇷🇺' },
  { iso2: 'ZA', name: 'Sudáfrica', dialCode: '+27', flag: '🇿🇦' },
  { iso2: 'SE', name: 'Suecia', dialCode: '+46', flag: '🇸🇪' },
  { iso2: 'CH', name: 'Suiza', dialCode: '+41', flag: '🇨🇭' },
  { iso2: 'TR', name: 'Turquía', dialCode: '+90', flag: '🇹🇷' },
]

/**
 * Prefijos ordenados del más largo al más corto.
 *
 * El orden importa para `splitPhoneNumber`: `+1809` (República Dominicana) tiene
 * que ganarle a `+1` (Estados Unidos), o cualquier número dominicano se
 * mostraría como estadounidense con un `809` pegado adelante.
 */
export const DIAL_CODES_BY_LENGTH: Country[] = [...COUNTRIES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length,
)
