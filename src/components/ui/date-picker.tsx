import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { format, parse, startOfMonth } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  const parsed = parseDateValue(value)
  if (!parsed) {
    return value
  }
  return format(parsed, 'PPP')
}

function parseDateValue(value?: string | null): Date | undefined {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return undefined
  const parsed = parse(trimmed, 'yyyy-MM-dd', new Date())
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }
  return parsed
}

function formatDateValue(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function clampMonth(date: Date, minDate?: Date, maxDate?: Date): Date {
  const normalized = startOfMonth(date)
  const minMonth = minDate ? startOfMonth(minDate) : undefined
  const maxMonth = maxDate ? startOfMonth(maxDate) : undefined

  if (minMonth && normalized < minMonth) return minMonth
  if (maxMonth && normalized > maxMonth) return maxMonth
  return normalized
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

  const displayValue = useMemo(() => {
    const trimmed = value?.trim() ?? ''
    if (!trimmed) return placeholder
    return formatDisplayDate(trimmed)
  }, [placeholder, value])

  const selectedDate = useMemo(() => parseDateValue(value), [value])
  const minDate = useMemo(() => parseDateValue(min), [min])
  const maxDate = useMemo(() => parseDateValue(max), [max])
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    clampMonth(selectedDate ?? minDate ?? new Date(), minDate, maxDate)
  )

  useEffect(() => {
    if (!open) return
    setViewMonth(clampMonth(selectedDate ?? minDate ?? new Date(), minDate, maxDate))
  }, [open, selectedDate, minDate, maxDate])

  return (
    <div className={cn('relative', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-expanded={open}
            className={cn(
              'w-full justify-between border-border bg-background text-left font-normal shadow-sm hover:border-olive/40 hover:bg-accent/40',
              !(value && value.trim()) && 'text-muted-foreground',
              triggerClassName
            )}
          >
            <span>{displayValue}</span>
            <CalendarDays className="h-4 w-4 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn('w-[25rem] max-w-[calc(100vw-2rem)] overflow-visible rounded-xl border-border p-0 shadow-xl', popoverClassName)}
          align="start"
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            month={viewMonth}
            onMonthChange={(nextMonth) => setViewMonth(clampMonth(nextMonth, minDate, maxDate))}
            startMonth={minDate}
            endMonth={maxDate}
            fromYear={minDate?.getFullYear() ?? 1900}
            toYear={maxDate?.getFullYear() ?? new Date().getFullYear() + 10}
            captionLayout="dropdown"
            fixedWeeks
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            onSelect={(nextDate) => {
              if (!nextDate) {
                if (!required) {
                  onChange('')
                }
                return
              }
              onChange(formatDateValue(nextDate))
              setOpen(false)
            }}
          />
          <div className="border-t border-border/80 bg-muted/20 px-3 py-1.5">
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange('')}
                disabled={required}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border bg-background shadow-sm"
                onClick={() => {
                  onChange(formatDateValue(new Date()))
                  setOpen(false)
                }}
              >
                Today
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <div className="sr-only">
        <input
          tabIndex={-1}
          aria-hidden="true"
          type="date"
          value={value ?? ''}
          required={required}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  )
}
