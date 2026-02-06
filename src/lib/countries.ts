export interface CountryOption {
  value: string
  label: string
  code: string
}

export interface CountryDialCodeOption {
  value: string
  label: string
}

const COUNTRY_CODES: string[] = [
  'AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ',
  'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BQ', 'BA', 'BW', 'BV', 'BR',
  'IO', 'BN', 'BG', 'BF', 'BI', 'CV', 'KH', 'CM', 'CA', 'KY', 'CF', 'TD', 'CL', 'CN', 'CX', 'CC',
  'CO', 'KM', 'CG', 'CD', 'CK', 'CR', 'CI', 'HR', 'CU', 'CW', 'CY', 'CZ', 'DK', 'DJ', 'DM', 'DO',
  'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FK', 'FO', 'FJ', 'FI', 'FR', 'GF', 'PF', 'TF',
  'GA', 'GM', 'GE', 'DE', 'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN', 'GW', 'GY',
  'HT', 'HM', 'VA', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IM', 'IL', 'IT', 'JM',
  'JP', 'JE', 'JO', 'KZ', 'KE', 'KI', 'KP', 'KR', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY',
  'LI', 'LT', 'LU', 'MO', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX',
  'FM', 'MD', 'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NC', 'NZ', 'NI',
  'NE', 'NG', 'NU', 'NF', 'MK', 'MP', 'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH',
  'PN', 'PL', 'PT', 'PR', 'QA', 'RE', 'RO', 'RU', 'RW', 'BL', 'SH', 'KN', 'LC', 'MF', 'PM', 'VC',
  'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SX', 'SK', 'SI', 'SB', 'SO', 'ZA', 'GS',
  'SS', 'ES', 'LK', 'SD', 'SR', 'SJ', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TZ', 'TH', 'TL', 'TG', 'TK',
  'TO', 'TT', 'TN', 'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UM', 'UY', 'UZ', 'VU',
  'VE', 'VN', 'VG', 'VI', 'WF', 'EH', 'YE', 'ZM', 'ZW',
]

function toFlagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return ''
  const A = 0x1f1e6
  const base = 'A'.charCodeAt(0)
  const first = code.charCodeAt(0) - base + A
  const second = code.charCodeAt(1) - base + A
  return String.fromCodePoint(first, second)
}

const regionDisplayNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

const allCountryOptions: CountryOption[] = (() => {
  const seenNames = new Set<string>()
  const options = COUNTRY_CODES.map((code) => {
    const name = regionDisplayNames?.of(code) ?? code
    const flag = toFlagEmoji(code)
    const label = flag ? `${flag} ${name}` : name
    return { value: name, label, code }
  }).filter((country) => {
    const key = country.value.toLowerCase()
    if (seenNames.has(key)) return false
    seenNames.add(key)
    return true
  })

  options.sort((a, b) => a.value.localeCompare(b.value))
  return options
})()

export function getAllCountryOptions(preferredCountry = 'South Africa'): CountryOption[] {
  const preferredIndex = allCountryOptions.findIndex(
    (country) => country.value.toLowerCase() === preferredCountry.toLowerCase()
  )
  if (preferredIndex <= 0) return allCountryOptions

  const preferred = allCountryOptions[preferredIndex]
  const remaining = allCountryOptions.filter((_, index) => index !== preferredIndex)
  return [preferred, ...remaining]
}

export function withCountryOption(
  options: CountryOption[],
  currentCountry: string
): CountryOption[] {
  const normalized = currentCountry.trim().toLowerCase()
  if (!normalized) return options

  const exists = options.some((option) => option.value.toLowerCase() === normalized)
  if (exists) return options

  return [{ value: currentCountry, label: currentCountry, code: '' }, ...options]
}

export const DEFAULT_COUNTRY_DIAL_CODE = '+27'

const COUNTRY_DIAL_CODE_BY_ISO: Record<string, string> = {
  ZA: '+27',
  US: '+1',
  CA: '+1',
  GB: '+44',
  IE: '+353',
  AU: '+61',
  NZ: '+64',
  IN: '+91',
  CN: '+86',
  JP: '+81',
  KR: '+82',
  SG: '+65',
  HK: '+852',
  AE: '+971',
  SA: '+966',
  QA: '+974',
  KW: '+965',
  OM: '+968',
  BH: '+973',
  EG: '+20',
  MA: '+212',
  DZ: '+213',
  TN: '+216',
  NG: '+234',
  KE: '+254',
  TZ: '+255',
  UG: '+256',
  GH: '+233',
  ZM: '+260',
  ZW: '+263',
  BW: '+267',
  NA: '+264',
  MZ: '+258',
  AO: '+244',
  ET: '+251',
  RW: '+250',
  SN: '+221',
  CI: '+225',
  CM: '+237',
  SD: '+249',
  SS: '+211',
  FR: '+33',
  DE: '+49',
  NL: '+31',
  BE: '+32',
  LU: '+352',
  CH: '+41',
  AT: '+43',
  IT: '+39',
  ES: '+34',
  PT: '+351',
  GR: '+30',
  CY: '+357',
  MT: '+356',
  DK: '+45',
  NO: '+47',
  SE: '+46',
  FI: '+358',
  IS: '+354',
  PL: '+48',
  CZ: '+420',
  SK: '+421',
  HU: '+36',
  RO: '+40',
  BG: '+359',
  HR: '+385',
  SI: '+386',
  RS: '+381',
  BA: '+387',
  ME: '+382',
  MK: '+389',
  AL: '+355',
  MD: '+373',
  UA: '+380',
  BY: '+375',
  RU: '+7',
  TR: '+90',
  IL: '+972',
  JO: '+962',
  LB: '+961',
  PK: '+92',
  BD: '+880',
  LK: '+94',
  NP: '+977',
  TH: '+66',
  VN: '+84',
  MY: '+60',
  ID: '+62',
  PH: '+63',
  KH: '+855',
  LA: '+856',
  MM: '+95',
  BR: '+55',
  AR: '+54',
  CL: '+56',
  PE: '+51',
  CO: '+57',
  VE: '+58',
  BO: '+591',
  PY: '+595',
  UY: '+598',
  EC: '+593',
  MX: '+52',
  GT: '+502',
  SV: '+503',
  HN: '+504',
  NI: '+505',
  CR: '+506',
  PA: '+507',
  CU: '+53',
  DO: '+1',
  JM: '+1',
  TT: '+1',
}

const DIAL_CODE_OPTIONS: CountryDialCodeOption[] = (() => {
  const optionSet = new Set<string>()

  allCountryOptions.forEach((country) => {
    const dialCode = COUNTRY_DIAL_CODE_BY_ISO[country.code]
    if (!dialCode) return
    optionSet.add(dialCode)
  })

  optionSet.add(DEFAULT_COUNTRY_DIAL_CODE)

  const rest = Array.from(optionSet)
    .filter((code) => code !== DEFAULT_COUNTRY_DIAL_CODE)
    .sort((a, b) => a.localeCompare(b))
    .map((code) => ({ value: code, label: code }))

  return [{ value: DEFAULT_COUNTRY_DIAL_CODE, label: DEFAULT_COUNTRY_DIAL_CODE }, ...rest]
})()

export function getCountryDialCodeOptions(): CountryDialCodeOption[] {
  return DIAL_CODE_OPTIONS
}

export function getDialCodeForCountryName(countryName: string): string {
  const normalized = countryName.trim().toLowerCase()
  if (!normalized) return DEFAULT_COUNTRY_DIAL_CODE

  const option = allCountryOptions.find((country) => country.value.toLowerCase() === normalized)
  if (!option) return DEFAULT_COUNTRY_DIAL_CODE

  return COUNTRY_DIAL_CODE_BY_ISO[option.code] ?? DEFAULT_COUNTRY_DIAL_CODE
}
