import { GRADE_DESCRIPTION } from '@/lib/scorecard'
import type { Grade } from '@/lib/constants'
import { cn } from '@/lib/utils'

const GRADE_STYLE: Record<Grade, string> = {
  A: 'bg-done-wash text-done border-done/25',
  B: 'bg-upcoming-wash text-upcoming border-upcoming/25',
  C: 'bg-today-wash text-today border-today/25',
  D: 'bg-overdue-wash text-overdue border-overdue/25',
}

export function GradeBadge({
  grade,
  size = 'sm',
}: {
  grade: Grade | null
  size?: 'sm' | 'lg'
}) {
  if (!grade) {
    return (
      <span
        title="Not enough completed orders to grade yet"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-parchment font-serif font-semibold text-muted',
          size === 'lg' ? 'size-14 text-2xl' : 'size-9 text-base',
        )}
      >
        –
      </span>
    )
  }

  return (
    <span
      title={GRADE_DESCRIPTION[grade]}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border font-serif font-semibold',
        GRADE_STYLE[grade],
        size === 'lg' ? 'size-14 text-3xl' : 'size-9 text-lg',
      )}
    >
      {grade}
    </span>
  )
}
