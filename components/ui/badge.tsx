import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { STAGE_LABELS, type OrderStage } from '@/lib/constants'
import type { Urgency } from '@/lib/followups'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
  {
    variants: {
      tone: {
        neutral: 'bg-parchment text-ink',
        gold: 'bg-gold-wash text-gold',
        overdue: 'bg-overdue-wash text-overdue',
        today: 'bg-today-wash text-today',
        missed: 'bg-missed-wash text-missed',
        upcoming: 'bg-upcoming-wash text-upcoming',
        done: 'bg-done-wash text-done',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

/** Urgency -> tone, in one place, so colours cannot drift between screens. */
export const URGENCY_TONE: Record<Urgency, NonNullable<BadgeProps['tone']>> = {
  overdue: 'overdue',
  today: 'today',
  missed: 'missed',
  upcoming: 'upcoming',
  done: 'done',
}

const STAGE_TONE: Record<OrderStage, NonNullable<BadgeProps['tone']>> = {
  ordered: 'neutral',
  in_production: 'upcoming',
  ready_for_dispatch: 'gold',
  dispatched: 'done',
  received: 'done',
  closed: 'neutral',
  on_hold: 'missed',
  cancelled: 'neutral',
}

export function StageBadge({ stage, className }: { stage: OrderStage; className?: string }) {
  return (
    <Badge tone={STAGE_TONE[stage]} className={className}>
      {STAGE_LABELS[stage]}
    </Badge>
  )
}

/** "Revised 3×" in red — a vendor who keeps pushing is the real problem. */
export function RevisionBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <Badge tone="overdue" title={`The promised date has moved ${count} time(s)`}>
      Revised {count}×
    </Badge>
  )
}

export function PartialBadge({ dispatched, total }: { dispatched: number; total: number }) {
  if (dispatched <= 0 || dispatched >= total) return null
  return (
    <Badge tone="today">
      Partially dispatched ({dispatched}/{total} pcs)
    </Badge>
  )
}
