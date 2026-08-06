import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Form primitives.
 *
 * These use native <select> and <input type="date"> rather than Radix
 * equivalents: on a phone the operating system's own pickers are faster,
 * more familiar, and cost nothing in JavaScript.
 */

const baseField =
  'w-full rounded-md border border-line bg-white px-3 py-2.5 text-charcoal shadow-sm ' +
  'placeholder:text-muted/70 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold ' +
  'disabled:cursor-not-allowed disabled:bg-parchment disabled:text-muted'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(baseField, 'h-11', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} rows={3} className={cn(baseField, 'min-h-[76px]', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(baseField, 'h-11 appearance-none pr-9', className)} {...props}>
    {children}
  </select>
))
Select.displayName = 'Select'

export function Label({
  className,
  children,
  hint,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label className={cn('block text-[13px] font-medium text-ink', className)} {...props}>
      {children}
      {hint && <span className="ml-1.5 font-normal text-muted">{hint}</span>}
    </label>
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  error,
  children,
  className,
}: {
  label?: string
  hint?: string
  htmlFor?: string
  error?: string | null
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor} hint={hint}>
          {label}
        </Label>
      )}
      {children}
      {error && <p className="text-[13px] text-overdue">{error}</p>}
    </div>
  )
}

export function FieldGroup({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-lg text-charcoal">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}
