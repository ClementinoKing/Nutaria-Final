import { useCallback, useMemo, useState } from 'react'

export type SettingsTourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'
export type SettingsTourActionVariant = 'default' | 'outline' | 'ghost'

export interface TourStepAction {
  label: string
  onSelect: () => void | Promise<void>
  variant?: SettingsTourActionVariant
}

export interface TourStep {
  id: string
  title: string
  description: string
  actions?: TourStepAction[]
  nextDisabled?: boolean
  target?: string
  placement?: SettingsTourPlacement
  beforeEnter?: () => void | Promise<void>
}

export interface UseSettingsTourResult {
  closeTour: () => void
  currentStep: TourStep | null
  currentStepIndex: number
  goToStep: (index: number) => Promise<void>
  isLastStep: boolean
  isOpen: boolean
  nextStep: () => Promise<void>
  openTour: () => Promise<void>
  previousStep: () => Promise<void>
  steps: TourStep[]
}

export function useSettingsTour(steps: TourStep[]): UseSettingsTourResult {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const runBeforeEnter = useCallback(async (step: TourStep | undefined) => {
    if (!step?.beforeEnter) return
    await step.beforeEnter()
  }, [])

  const goToStep = useCallback(
    async (index: number) => {
      if (index < 0 || index >= steps.length) return
      await runBeforeEnter(steps[index])
      setCurrentStepIndex(index)
    },
    [runBeforeEnter, steps]
  )

  const openTour = useCallback(async () => {
    if (steps.length === 0) return
    setIsOpen(true)
    await goToStep(0)
  }, [goToStep, steps.length])

  const closeTour = useCallback(() => {
    setIsOpen(false)
    setCurrentStepIndex(0)
  }, [])

  const nextStep = useCallback(async () => {
    if (currentStepIndex >= steps.length - 1) {
      closeTour()
      return
    }
    await goToStep(currentStepIndex + 1)
  }, [closeTour, currentStepIndex, goToStep, steps.length])

  const previousStep = useCallback(async () => {
    if (currentStepIndex <= 0) return
    await goToStep(currentStepIndex - 1)
  }, [currentStepIndex, goToStep])

  const currentStep = useMemo(() => steps[currentStepIndex] ?? null, [currentStepIndex, steps])

  return {
    closeTour,
    currentStep,
    currentStepIndex,
    goToStep,
    isLastStep: currentStepIndex === steps.length - 1,
    isOpen,
    nextStep,
    openTour,
    previousStep,
    steps,
  }
}
