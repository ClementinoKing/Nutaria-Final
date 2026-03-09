const E164_PATTERN = /^\+[1-9]\d{7,14}$/
const PHONE_USERNAME_DOMAIN = 'users.nutaria.local'

export function isLikelyEmail(input: string): boolean {
  return input.includes('@')
}

export function isValidE164(phone: string): boolean {
  return E164_PATTERN.test(phone)
}

function stripPhoneSeparators(input: string): string {
  return input.replace(/[\s()-]/g, '')
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
): { type: 'email' | 'phone'; value: string } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (isLikelyEmail(trimmed)) {
    return { type: 'email', value: trimmed.toLowerCase() }
  }

  const phone = normalizePhoneToE164(trimmed)
  if (!phone) return null

  return { type: 'phone', value: phone }
}

export function phoneToUsernameEmail(phoneE164: string): string {
  const digitsOnly = phoneE164.replace(/\D/g, '')
  return `u${digitsOnly}@${PHONE_USERNAME_DOMAIN}`
}
