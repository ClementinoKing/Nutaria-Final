type ErrorLike = {
  message?: unknown
  code?: unknown
  status?: unknown
  details?: unknown
  hint?: unknown
}

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.'

const TECHNICAL_PATTERNS = [
  /supabase/i,
  /postgrest/i,
  /postgres/i,
  /\bsql\b/i,
  /\brpc\b/i,
  /\bapi\b/i,
  /\bconstraint\b/i,
  /null value/i,
  /not-null/i,
  /duplicate key/i,
  /foreign key/i,
  /violates/i,
  /row-level security/i,
  /\brls\b/i,
  /\bpermission denied\b/i,
  /\bunauthorized\b/i,
  /\bforbidden\b/i,
  /\bjwt\b/i,
  /\bschema cache\b/i,
  /\brelation\b.*\bdoes not exist\b/i,
  /\binvalid input syntax\b/i,
  /\bno rows? found\b/i,
  /\bPGRST\d+\b/i,
  /\b23\d{3}\b/,
  /\b22\d{3}\b/,
  /\b5\d{2}\b/,
]

const technicalMessageMap: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /duplicate key/i,
    message: 'This item already exists. Try a different name or code and save again.',
  },
  {
    pattern: /null value|not-null/i,
    message: 'Some required information is missing. Fill in the form and try again.',
  },
  {
    pattern: /foreign key|violates/i,
    message: 'One of the linked records is missing or has changed. Refresh the page and try again.',
  },
  {
    pattern: /row-level security|\brls\b|permission denied|unauthorized|forbidden|\bjwt\b/i,
    message: 'You do not have access to complete this action right now. Sign in again or ask an administrator for help.',
  },
  {
    pattern: /invalid input syntax/i,
    message: 'Some of the information entered is not in the right format. Check the form and try again.',
  },
  {
    pattern: /relation .* does not exist|schema cache/i,
    message: 'This part of the system is still being set up. Please refresh and try again, or contact support if it keeps happening.',
  },
  {
    pattern: /no rows? found/i,
    message: 'We could not find the record you were looking for. Refresh the page and try again.',
  },
  {
    pattern: /PGRST\d+|23\d{3}|22\d{3}|5\d{2}/i,
    message: 'We could not complete that action. Please refresh the page and try again.',
  },
]

function compact(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

function looksTechnical(message: string): boolean {
  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(message))
}

function humanizeFailure(message: string): string {
  const compacted = compact(message)
  if (!compacted) {
    return DEFAULT_MESSAGE
  }

  if (/^please\b/i.test(compacted)) {
    return compacted
  }

  if (/^failed to /i.test(compacted)) {
    const action = compacted.replace(/^failed to /i, '').replace(/\.$/, '')
    return `We couldn't ${action}. Please try again.`
  }

  if (/^unable to /i.test(compacted)) {
    const action = compacted.replace(/^unable to /i, '').replace(/\.$/, '')
    return `We couldn't ${action}. Please try again.`
  }

  if (/^could not /i.test(compacted)) {
    const action = compacted.replace(/^could not /i, '').replace(/\.$/, '')
    return `We couldn't ${action}. Please try again.`
  }

  if (/^cannot /i.test(compacted)) {
    const action = compacted.replace(/^cannot /i, '').replace(/\.$/, '')
    return `We can't ${action}. Please try a different option.`
  }

  if (/^can't /i.test(compacted)) {
    const action = compacted.replace(/^can't /i, '').replace(/\.$/, '')
    return `We can't ${action}. Please try a different option.`
  }

  if (/^error\b/i.test(compacted)) {
    return DEFAULT_MESSAGE
  }

  return compacted.endsWith('.') ? compacted : `${compacted}.`
}

function mapTechnicalMessage(message: string): string {
  const match = technicalMessageMap.find(({ pattern }) => pattern.test(message))
  if (match) {
    return match.message
  }

  if (/timeout|network|fetch|failed to fetch|load failed|network error|offline/i.test(message)) {
    return 'We could not reach the server. Check your connection and try again.'
  }

  return DEFAULT_MESSAGE
}

export function getUserFriendlyErrorMessage(error: unknown, fallback = DEFAULT_MESSAGE): string {
  const sourceMessage =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in (error as ErrorLike)
        ? String((error as ErrorLike).message ?? '')
        : ''

  const sanitizedFallback = humanizeFailure(fallback)

  if (!sourceMessage) {
    return sanitizedFallback
  }

  const compacted = compact(sourceMessage)
  if (!compacted) {
    return sanitizedFallback
  }

  if (looksTechnical(compacted)) {
    return mapTechnicalMessage(compacted)
  }

  return humanizeFailure(compacted)
}

export function getFriendlyToastErrorMessage(error: unknown): string {
  return getUserFriendlyErrorMessage(error)
}
