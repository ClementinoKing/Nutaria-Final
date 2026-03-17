import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SettingsTourPlacement, TourStep } from '@/hooks/useSettingsTour'

interface SettingsTourProps {
  currentStepIndex: number
  isLastStep: boolean
  onBack: () => void | Promise<void>
  onClose: () => void
  onNext: () => void | Promise<void>
  open: boolean
  step: TourStep | null
  totalSteps: number
}

type StepRect = {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

const CARD_WIDTH = 320
const CARD_HEIGHT = 228
const VIEWPORT_PADDING = 16
const TARGET_PADDING = 10

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getStepRect(target: Element | null): StepRect | null {
  if (!target) return null
  const rect = target.getBoundingClientRect()
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  }
}

function getCardPosition(
  rect: StepRect | null,
  placement: SettingsTourPlacement
): { left: number; top: number } {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const maxLeft = viewportWidth - CARD_WIDTH - VIEWPORT_PADDING
  const maxTop = viewportHeight - CARD_HEIGHT - VIEWPORT_PADDING

  if (!rect || placement === 'center') {
    return {
      left: clamp((viewportWidth - CARD_WIDTH) / 2, VIEWPORT_PADDING, maxLeft),
      top: clamp((viewportHeight - CARD_HEIGHT) / 2, VIEWPORT_PADDING, maxTop),
    }
  }

  const centeredLeft = clamp(rect.left + rect.width / 2 - CARD_WIDTH / 2, VIEWPORT_PADDING, maxLeft)
  const centeredTop = clamp(rect.top + rect.height / 2 - CARD_HEIGHT / 2, VIEWPORT_PADDING, maxTop)
  const spaceAbove = rect.top
  const spaceBelow = viewportHeight - rect.bottom
  const spaceLeft = rect.left
  const spaceRight = viewportWidth - rect.right

  if (placement === 'top' || (placement === 'bottom' && spaceBelow < CARD_HEIGHT + 24 && spaceAbove > spaceBelow)) {
    return {
      left: centeredLeft,
      top: clamp(rect.top - CARD_HEIGHT - VIEWPORT_PADDING, VIEWPORT_PADDING, maxTop),
    }
  }

  if (placement === 'left' && spaceLeft > CARD_WIDTH + VIEWPORT_PADDING * 2) {
    return {
      left: clamp(rect.left - CARD_WIDTH - VIEWPORT_PADDING, VIEWPORT_PADDING, maxLeft),
      top: centeredTop,
    }
  }

  if (placement === 'right' && spaceRight > CARD_WIDTH + VIEWPORT_PADDING * 2) {
    return {
      left: clamp(rect.right + VIEWPORT_PADDING, VIEWPORT_PADDING, maxLeft),
      top: centeredTop,
    }
  }

  return {
    left: centeredLeft,
    top: clamp(rect.bottom + VIEWPORT_PADDING, VIEWPORT_PADDING, maxTop),
  }
}

export default function SettingsTour({
  currentStepIndex,
  isLastStep,
  onBack,
  onClose,
  onNext,
  open,
  step,
  totalSteps,
}: SettingsTourProps) {
  const [targetRect, setTargetRect] = useState<StepRect | null>(null)
  const [targetFound, setTargetFound] = useState(false)

  useEffect(() => {
    if (!open || !step) {
      setTargetRect(null)
      setTargetFound(false)
      return
    }

    let disposed = false
    let animationFrame = 0
    let timeoutId = 0

    const resolveTarget = (attempt = 0) => {
      if (disposed) return
      if (!step.target) {
        setTargetRect(null)
        setTargetFound(true)
        return
      }

      const target = document.querySelector(step.target)
      const rect = getStepRect(target)

      if (target && rect) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
        timeoutId = window.setTimeout(() => {
          if (disposed) return
          const refreshedRect = getStepRect(target)
          setTargetRect(refreshedRect)
          setTargetFound(Boolean(refreshedRect))
        }, 180)
        return
      }

      if (attempt < 20) {
        animationFrame = window.requestAnimationFrame(() => resolveTarget(attempt + 1))
      } else {
        setTargetRect(null)
        setTargetFound(false)
      }
    }

    resolveTarget()

    const refreshRect = () => {
      if (!step.target) return
      const target = document.querySelector(step.target)
      const rect = getStepRect(target)
      setTargetRect(rect)
      setTargetFound(Boolean(rect))
    }

    window.addEventListener('resize', refreshRect)
    window.addEventListener('scroll', refreshRect, true)

    return () => {
      disposed = true
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(timeoutId)
      window.removeEventListener('resize', refreshRect)
      window.removeEventListener('scroll', refreshRect, true)
    }
  }, [open, step])

  const cardPosition = useMemo(() => {
    if (!step) return { left: VIEWPORT_PADDING, top: VIEWPORT_PADDING }
    return getCardPosition(targetRect, step.placement ?? 'bottom')
  }, [step, targetRect])

  if (!open || !step || typeof document === 'undefined') {
    return null
  }

  const highlightRect = targetRect
    ? {
        left: Math.max(targetRect.left - TARGET_PADDING, 8),
        top: Math.max(targetRect.top - TARGET_PADDING, 8),
        width: Math.min(targetRect.width + TARGET_PADDING * 2, window.innerWidth - 16),
        height: Math.min(targetRect.height + TARGET_PADDING * 2, window.innerHeight - 16),
      }
    : null

  return createPortal(
    <div className="fixed inset-0 z-[80]" aria-modal="true" role="dialog">
      {highlightRect ? (
        <>
          <div className="fixed inset-x-0 top-0 bg-black/55" style={{ height: highlightRect.top }} />
          <div
            className="fixed bg-black/55"
            style={{ top: highlightRect.top, left: 0, width: highlightRect.left, height: highlightRect.height }}
          />
          <div
            className="fixed bg-black/55"
            style={{
              top: highlightRect.top,
              left: highlightRect.left + highlightRect.width,
              right: 0,
              height: highlightRect.height,
            }}
          />
          <div
            className="fixed inset-x-0 bottom-0 bg-black/55"
            style={{ top: highlightRect.top + highlightRect.height }}
          />
          <div
            className="fixed rounded-2xl border-2 border-olive bg-white/10"
            style={{
              left: highlightRect.left,
              top: highlightRect.top,
              width: highlightRect.width,
              height: highlightRect.height,
            }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/55" />
      )}

      <div
        className={cn(
          'fixed z-[81] w-[320px] rounded-2xl border border-olive-light/50 bg-white p-5 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.45)]',
          !targetFound && step.target && 'border-amber-200'
        )}
        style={{ left: cardPosition.left, top: cardPosition.top }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive-dark/70">
              Step {currentStepIndex + 1} of {totalSteps}
            </p>
            <h3 className="mt-2 text-lg font-semibold text-text-dark">{step.title}</h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-text-dark/70 hover:bg-olive-light/20"
            onClick={onClose}
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm leading-6 text-text-dark/75">{step.description}</p>

        {step.actions?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {step.actions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant={action.variant ?? 'outline'}
                onClick={() => void action.onSelect()}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}

        {!targetFound && step.target ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This step needs the related interface to be visible. Use Next or Back to reopen it if needed.
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={onBack} disabled={currentStepIndex === 0}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              className="bg-olive hover:bg-olive-dark"
              onClick={onNext}
              disabled={step.nextDisabled}
            >
              {isLastStep ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
