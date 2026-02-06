import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  id?: string
  value?: string | null
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  triggerClassName?: string
  popoverClassName?: string
  min?: string
  max?: string
}

function formatDisplayDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(parsed)
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
  required = false,
  className,
  triggerClassName,
  popoverClassName,
  min,
  max,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const displayValue = useMemo(() => {
    const trimmed = value?.trim() ?? ''
    if (!trimmed) return placeholder
    return formatDisplayDate(trimmed)
  }, [placeholder, value])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <Button
        id={id}
        type="button"
        variant="outline"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'w-full justify-between border-input bg-background text-left font-normal',
          !(value && value.trim()) && 'text-muted-foreground',
          triggerClassName
        )}
      >
        <span>{displayValue}</span>
        <CalendarDays className="h-4 w-4 opacity-70" />
      </Button>

      {open && !disabled && (
        <div className={cn('absolute z-50 mt-2 w-full min-w-[220px] rounded-md border border-olive-light/40 bg-white p-3 shadow-lg', popoverClassName)}>
          <input
            type="date"
            value={value ?? ''}
            required={required}
            min={min}
            max={max}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2"
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange('')}
              disabled={required}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(new Date().toISOString().slice(0, 10))}
            >
              Today
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
