import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  text?: string
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
}

export function Spinner({ className, size = 'md', text }: SpinnerProps) {
  return (
    <div className={cn('flex min-h-[60vh] flex-col items-center justify-center gap-3', className)}>
      <Loader2 className={cn('animate-spin text-olive-dark dark:text-olive-light', sizeClasses[size])} />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}
