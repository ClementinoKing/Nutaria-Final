const E164_PATTERN = /^\+[1-9]\d{7,14}$/
const AUTH_ALIAS_DOMAIN = 'users.nutaria.local'

export function isLikelyEmail(input: string): boolean {
  return input.includes('@')
}

export function isValidE164(phone: string): boolean {
  return E164_PATTERN.test(phone)
}

function stripPhoneSeparators(input: string): string {
  return input.replace(/[\s()-]/g, '')
}

function normalizeUsernameInput(input: string): string | null {
  const normalized = input.trim().toLowerCase()
  if (!normalized || normalized.includes('@')) return null
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/.test(normalized)) {
    return null
  }
  return normalized
}

export function normalizePhoneToE164(input: string, defaultCountryCode = '+265'): string | null {
  const cleaned = stripPhoneSeparators(input.trim())
  if (!cleaned) return null

  let normalized = cleaned

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`
  }

  if (normalized.startsWith('0')) {
    normalized = `${defaultCountryCode}${normalized.slice(1)}`
  } else if (!normalized.startsWith('+') && normalized.startsWith(defaultCountryCode.slice(1))) {
    normalized = `+${normalized}`
  } else if (!normalized.startsWith('+')) {
    normalized = `${defaultCountryCode}${normalized}`
  }

  return isValidE164(normalized) ? normalized : null
}

export function classifyIdentifier(
  input: string
): { type: 'email' | 'phone' | 'username'; value: string } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (isLikelyEmail(trimmed)) {
    return { type: 'email', value: trimmed.toLowerCase() }
  }

  const phone = normalizePhoneToE164(trimmed)
  if (phone) {
    return { type: 'phone', value: phone }
  }

  const username = normalizeUsernameInput(trimmed)
  if (username) {
    return { type: 'username', value: username }
  }

  return null
}

export function phoneToUsernameEmail(phoneE164: string): string {
  const digitsOnly = phoneE164.replace(/\D/g, '')
  return `u${digitsOnly}@${AUTH_ALIAS_DOMAIN}`
}

export function normalizeUsername(input: string): string | null {
  return normalizeUsernameInput(input)
}

export function usernameToAuthEmail(username: string): string | null {
  const normalized = normalizeUsernameInput(username)
  if (!normalized) return null
  return `u${normalized}@${AUTH_ALIAS_DOMAIN}`
}
