import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream ' +
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-charcoal text-cream hover:bg-charcoal/90',
        gold: 'bg-gold text-white hover:bg-gold/90',
        outline: 'border border-line bg-white/60 text-charcoal hover:bg-parchment',
        ghost: 'text-ink hover:bg-parchment',
        danger: 'bg-overdue text-white hover:bg-overdue/90',
        quiet: 'text-muted hover:text-charcoal hover:bg-parchment',
      },
      size: {
        // Minimum 44px tall — this is used one-handed on a shop floor.
        default: 'h-11 px-4 py-2',
        sm: 'h-9 rounded-sm px-3 text-[13px]',
        lg: 'h-12 px-6 text-base',
        icon: 'h-11 w-11',
        full: 'h-12 w-full px-4 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
