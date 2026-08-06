import { Check, Clock, Minus } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/dates'
import { CONTACT_METHOD_LABELS } from '@/lib/constants'
import { followupUrgency } from '@/lib/followups'
import { EmptyState } from '@/components/common/states'
import type { Followup } from '@/lib/types'

/**
 * The checkpoint ladder, with each vendor response shown inline. Skipped rungs
 * stay visible — a row of ignored checkpoints is itself information.
 */
export function OrderTimeline({ followups, today }: { followups: Followup[]; today: string }) {
  if (followups.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Follow-up schedule
        </h2>
        <EmptyState title="No follow-ups scheduled" className="py-6" />
      </section>
    )
  }

  const sorted = [...followups].sort((a, b) => a.due_date.localeCompare(b.due_date))

  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
        Follow-up schedule
      </h2>
      <ol className="card overflow-hidden">
        {sorted.map((f, idx) => {
          const urgency = followupUrgency(f.due_date, f.status, today)
          const isDone = f.status === 'done'
          const isSkipped = f.status === 'skipped'

          const dotClass = isDone
            ? 'bg-done text-white'
            : isSkipped
              ? 'bg-parchment text-muted'
              : urgency === 'missed'
                ? 'bg-missed text-white'
                : urgency === 'today'
                  ? 'bg-today text-white'
                  : 'bg-upcoming/15 text-upcoming'

          return (
            <li
              key={f.id}
              className={`flex gap-3 px-3.5 py-3 ${idx > 0 ? 'border-t border-line' : ''}`}
            >
              <div className="flex flex-col items-center">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full ${dotClass}`}
                >
                  {isDone ? (
                    <Check className="size-3.5" />
                  ) : isSkipped ? (
                    <Minus className="size-3.5" />
                  ) : (
                    <Clock className="size-3.5" />
                  )}
                </span>
                {idx < sorted.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
              </div>

              <div className="min-w-0 flex-1 pb-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={`text-[14px] font-medium ${
                      isSkipped ? 'text-muted line-through' : 'text-charcoal'
                    }`}
                  >
                    {formatDate(f.due_date)}
                  </span>
                  <span className="text-[12px] text-muted">
                    {f.checkpoint_pct === null
                      ? 'overdue check'
                      : f.checkpoint_pct === 100
                        ? 'expected dispatch'
                        : `${f.checkpoint_pct}% checkpoint`}
                  </span>
                  {!isDone && !isSkipped && urgency === 'missed' && (
                    <span className="text-[12px] font-medium text-missed">not logged</span>
                  )}
                  {(f.snooze_count ?? 0) > 0 && (
                    <span className="text-[12px] text-muted">snoozed {f.snooze_count}×</span>
                  )}
                </div>

                {isDone && (
                  <div className="mt-1 space-y-0.5">
                    {f.vendor_response && (
                      <p className="text-[13px] leading-relaxed text-ink">
                        &ldquo;{f.vendor_response}&rdquo;
                      </p>
                    )}
                    <p className="text-[12px] text-muted">
                      {[
                        f.contacted_via ? CONTACT_METHOD_LABELS[f.contacted_via] : null,
                        f.spoke_to ? `spoke to ${f.spoke_to}` : null,
                        f.done_at ? formatDateTime(f.done_at) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {f.new_promised_date && (
                      <p className="text-[12px] font-medium text-overdue">
                        New date promised: {formatDate(f.new_promised_date)}
                      </p>
                    )}
                    {f.next_action && (
                      <p className="text-[12px] text-ink">Next: {f.next_action}</p>
                    )}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
