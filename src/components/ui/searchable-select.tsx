import * as React from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './input'

export interface SearchableSelectOption {
  value: string
  label: string
}

export interface SearchableSelectProps {
  id?: string
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  emptyMessage?: string
}

export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  required = false,
  className,
  emptyMessage = 'No options found',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties>({})
  const containerRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const updateDropdownPosition = React.useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const availableBelow = viewportHeight - rect.bottom - 12
    const availableAbove = rect.top - 12
    const openUpwards = availableBelow < 280 && availableAbove > availableBelow

    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: openUpwards ? undefined : rect.bottom + 8,
      bottom: openUpwards ? viewportHeight - rect.top + 8 : undefined,
      maxHeight: Math.max(180, Math.min(openUpwards ? availableAbove : availableBelow, 360)),
    })
  }, [])

  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  )

  const filteredOptions = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return options
    }
    const term = searchTerm.toLowerCase()
    return options.filter((opt) => opt.label.toLowerCase().includes(term))
  }, [options, searchTerm])

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        !dropdownRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  React.useEffect(() => {
    if (!isOpen) return

    updateDropdownPosition()

    const handlePositionChange = () => updateDropdownPosition()

    window.addEventListener('resize', handlePositionChange)
    window.addEventListener('scroll', handlePositionChange, true)

    return () => {
      window.removeEventListener('resize', handlePositionChange)
      window.removeEventListener('scroll', handlePositionChange, true)
    }
  }, [isOpen, updateDropdownPosition])

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleClear = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onChange('')
    setSearchTerm('')
  }

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen((prev) => !prev)
      if (!isOpen) {
        setSearchTerm('')
      }
    }
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          id={id}
          onClick={handleToggle}
          disabled={disabled}
          className={cn(
            'flex h-11 w-full items-center justify-between rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition',
            'focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40',
            'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
            'dark:focus:border-olive dark:focus:ring-olive/40',
            disabled && 'cursor-not-allowed opacity-50',
            !selectedOption && 'text-text-dark/50',
          )}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <div className="flex items-center gap-1">
            {selectedOption && !disabled && (
              <span
                onClick={handleClear}
                className="cursor-pointer rounded p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700"
                aria-label="Clear selection"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleClear(e as any)
                  }
                }}
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                isOpen && 'rotate-180',
              )}
            />
          </div>
        </button>
        {required && (
          <input
            type="hidden"
            value={value}
            required
            aria-hidden="true"
          />
        )}
      </div>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={dropdownRef}
              style={dropdownStyle}
              className="z-[140] overflow-hidden rounded-lg border border-olive-light/60 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="p-2">
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <div
                className="overflow-auto"
                style={{ maxHeight: dropdownStyle.maxHeight ? Number(dropdownStyle.maxHeight) - 60 : 300 }}
              >
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-text-dark/60 dark:text-slate-400">
                    {emptyMessage}
                  </div>
                ) : (
                  <ul
                    role="listbox"
                    className="p-1"
                    aria-label="Options"
                  >
                    {filteredOptions.map((option) => (
                      <li
                        key={option.value}
                        role="option"
                        aria-selected={option.value === value}
                        onClick={() => handleSelect(option.value)}
                        className={cn(
                          'cursor-pointer rounded-md px-3 py-2 text-sm transition-colors',
                          'hover:bg-olive-light/20 dark:hover:bg-slate-700',
                          option.value === value &&
                            'bg-olive-light/30 dark:bg-slate-800',
                        )}
                      >
                        {option.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
