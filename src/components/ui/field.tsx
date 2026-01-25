import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "./label"

export interface FieldGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

const FieldGroup = React.forwardRef<HTMLDivElement, FieldGroupProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex flex-col gap-6", className)}
        {...props}
      />
    )
  }
)
FieldGroup.displayName = "FieldGroup"

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {}

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex flex-col gap-2", className)}
        {...props}
      />
    )
  }
)
Field.displayName = "Field"

export interface FieldLabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const FieldLabel = React.forwardRef<HTMLLabelElement, FieldLabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <Label
        ref={ref}
        className={cn("text-card-foreground", className)}
        {...props}
      />
    )
  }
)
FieldLabel.displayName = "FieldLabel"

export interface FieldDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  FieldDescriptionProps
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
FieldDescription.displayName = "FieldDescription"

export interface FieldSeparatorProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

const FieldSeparator = React.forwardRef<HTMLDivElement, FieldSeparatorProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex items-center gap-4 text-sm text-muted-foreground",
          className
        )}
        {...props}
      >
        <div className="flex-1 border-t border-border" />
        {children && <span>{children}</span>}
        <div className="flex-1 border-t border-border" />
      </div>
    )
  }
)
FieldSeparator.displayName = "FieldSeparator"

export {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
}
