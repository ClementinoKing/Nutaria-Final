import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2.5", className)}
      classNames={{
        root: "w-full",
        months: "flex w-full flex-col",
        month: "w-full space-y-2",
        month_caption: "relative flex h-12 items-center justify-center px-12",
        caption_label: "pointer-events-none relative z-10 flex h-full w-full items-center truncate px-3 text-sm font-semibold text-foreground",
        nav: "pointer-events-none absolute inset-x-0 top-1.5 flex items-center justify-between px-1.5",
        button_previous:
          "pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-olive/40 hover:bg-olive-light/20 hover:text-foreground",
        button_next:
          "pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-olive/40 hover:bg-olive-light/20 hover:text-foreground",
        dropdowns: "flex items-center justify-center gap-3 px-10",
        dropdown_root:
          "relative inline-flex h-10 min-w-[8.25rem] items-center overflow-hidden rounded-md border border-border bg-background shadow-sm transition-colors focus-within:border-olive/50 focus-within:ring-2 focus-within:ring-olive/20",
        dropdown:
          "absolute inset-0 h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 opacity-0 outline-none",
        chevron: "pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground",
        month_grid: "w-full table-fixed border-collapse",
        weeks: "",
        week: "",
        weekdays: "",
        weekday:
          "h-9 px-0 pb-1 text-center text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
        day: "h-10 p-0 text-center align-middle text-sm",
        day_button:
          "mx-auto flex h-9 w-9 items-center justify-center rounded-full p-0 font-medium text-foreground transition-colors aria-selected:opacity-100 hover:bg-olive-light/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive/30",
        selected:
          "[&>button]:bg-olive-dark [&>button]:text-white [&>button]:shadow-sm [&>button]:hover:bg-olive-dark [&>button]:hover:text-white [&>button]:focus:bg-olive-dark [&>button]:focus:text-white",
        today: "[&>button]:bg-olive-light/18 [&>button]:text-foreground [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-olive/25",
        outside: "text-muted-foreground/70 opacity-60",
        disabled: "text-muted-foreground/50 opacity-40",
        hidden: "invisible",
        range_middle: "[&>button]:rounded-none [&>button]:bg-olive-light/30 [&>button]:text-foreground",
        range_start: "[&>button]:rounded-full [&>button]:bg-olive-dark [&>button]:text-white",
        range_end: "[&>button]:rounded-full [&>button]:bg-olive-dark [&>button]:text-white",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("h-4 w-4", chevronClassName)} />
          ) : (
            <ChevronRight className={cn("h-4 w-4", chevronClassName)} />
          ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
