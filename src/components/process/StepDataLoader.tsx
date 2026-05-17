import { Loader2 } from 'lucide-react'

interface StepDataLoaderProps {
  text?: string
}

export function StepDataLoader({ text = 'Loading step data...' }: StepDataLoaderProps) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-xl border border-olive-light/35 bg-white/70 text-text-dark/70 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200">
      <Loader2 className="h-8 w-8 animate-spin text-olive" aria-hidden />
      <p className="mt-3 text-sm font-medium">{text}</p>
    </div>
  )
}
