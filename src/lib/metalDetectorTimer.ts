export interface MetalDetectorTimerState {
  lotId: number
  endAtMs: number
}

const LOT_TIMER_KEY_PREFIX = 'nutaria:metal-detector-timer:lot:'
const ACTIVE_TIMER_KEY = 'nutaria:metal-detector-timer:active'
const TIMER_UPDATED_EVENT = 'nutaria:metal-detector-timer-updated'

function emitTimerUpdatedEvent(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(TIMER_UPDATED_EVENT))
}

export function formatSecondsToHms(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function getTimerStorageKey(lotId: number): string {
  return `${LOT_TIMER_KEY_PREFIX}${lotId}`
}

function parseTimerPayload(raw: string | null): MetalDetectorTimerState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { lotId?: number; endAtMs?: number }
    const lotId = Number(parsed?.lotId)
    const endAtMs = Number(parsed?.endAtMs)
    if (!Number.isFinite(lotId) || !Number.isFinite(endAtMs) || endAtMs <= 0) {
      return null
    }
    return { lotId, endAtMs }
  } catch {
    return null
  }
}

export function loadTimerFromStorage(lotId: number): number | null {
  if (typeof window === 'undefined' || !Number.isFinite(lotId)) return null
  try {
    const raw = window.localStorage.getItem(getTimerStorageKey(lotId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { endAtMs?: number }
    const endAtMs = Number(parsed?.endAtMs)
    if (!Number.isFinite(endAtMs) || endAtMs <= 0) return null
    return endAtMs
  } catch {
    return null
  }
}

export function saveTimerToStorage(lotId: number, endAtMs: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(lotId) || !Number.isFinite(endAtMs)) return
  try {
    window.localStorage.setItem(getTimerStorageKey(lotId), JSON.stringify({ endAtMs }))
    emitTimerUpdatedEvent()
  } catch {
    // Ignore storage failures in UI-only timer.
  }
}

export function clearTimerFromStorage(lotId: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(lotId)) return
  try {
    window.localStorage.removeItem(getTimerStorageKey(lotId))
    emitTimerUpdatedEvent()
  } catch {
    // Ignore storage failures in UI-only timer.
  }
}

export function saveActiveTimerToStorage(lotId: number, endAtMs: number, emitEvent = true): void {
  if (typeof window === 'undefined' || !Number.isFinite(lotId) || !Number.isFinite(endAtMs)) return
  try {
    window.localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify({ lotId, endAtMs }))
    if (emitEvent) emitTimerUpdatedEvent()
  } catch {
    // Ignore storage failures in UI-only timer.
  }
}

export function clearActiveTimerFromStorage(emitEvent = true): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ACTIVE_TIMER_KEY)
    if (emitEvent) emitTimerUpdatedEvent()
  } catch {
    // Ignore storage failures in UI-only timer.
  }
}

export function loadActiveTimerFromStorage(): MetalDetectorTimerState | null {
  if (typeof window === 'undefined') return null
  return parseTimerPayload(window.localStorage.getItem(ACTIVE_TIMER_KEY))
}

export function loadAnyRunningTimerFromStorage(nowMs: number): MetalDetectorTimerState | null {
  if (typeof window === 'undefined') return null

  const active = loadActiveTimerFromStorage()
  if (active && active.endAtMs > nowMs) {
    return active
  }

  let best: MetalDetectorTimerState | null = null
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key || !key.startsWith(LOT_TIMER_KEY_PREFIX)) continue
      const lotIdText = key.slice(LOT_TIMER_KEY_PREFIX.length)
      const lotId = Number(lotIdText)
      if (!Number.isFinite(lotId)) continue

      const endAtMs = loadTimerFromStorage(lotId)
      if (!endAtMs || endAtMs <= nowMs) continue

      if (!best || endAtMs > best.endAtMs) {
        best = { lotId, endAtMs }
      }
    }
  } catch {
    return null
  }

  if (best) {
    saveActiveTimerToStorage(best.lotId, best.endAtMs, false)
  } else {
    clearActiveTimerFromStorage(false)
  }

  return best
}

export function getTimerUpdatedEventName(): string {
  return TIMER_UPDATED_EVENT
}
