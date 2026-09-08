import { Suspense } from 'react'
import Link from 'next/link'
import { CalendarCheck, ChevronRight, Flag, PartyPopper } from 'lucide-react'
import { countOpenFlags, getDashboard, getSettings } from '@/lib/queries'
import { getProfile } from '@/lib/auth'
import { formatDate, greetingIST, todayIST } from '@/lib/dates'
import { DEFAULT_WHATSAPP_TEMPLATE, COMING_UP_DAYS } from '@/lib/constants'
import { FollowupCard, ComingUpRow } from '@/components/dashboard/followup-card'
import { SnapshotStrip } from '@/components/dashboard/snapshot-strip'
import { EmptyState, ListSkeleton, SectionHeading } from '@/components/common/states'
import { Button } from '@/components/ui/button'

// Always fresh: "what must I chase today" is worthless if it is cached.
export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </div>
  )
}

async function Dashboard() {
  const profile = await getProfile()
  const isAdmin = profile?.role === 'admin'

  const [data, settings, openFlags] = await Promise.all([
    getDashboard({ isAdmin }),
    getSettings(),
    countOpenFlags(),
  ])
  const template = settings?.whatsapp_template || DEFAULT_WHATSAPP_TEMPLATE

  const { overdue, dueToday, missed, comingUp, today, snapshot, vendorsToChase } = data
  const nothingToDo = overdue.length === 0 && dueToday.length === 0 && missed.length === 0

  const firstName = profile?.full_name?.split(' ')[0] ?? ''

  return (
    <>
      <header>
        <h1 className="font-serif text-3xl leading-tight text-charcoal">
          {greetingIST()}
          {firstName && `, ${firstName}`}.
        </h1>
        <p className="mt-1 text-[15px] text-ink">
          {vendorsToChase === 0 ? (
            'No vendors need chasing today.'
          ) : (
            <>
              <span className="font-semibold text-charcoal">{vendorsToChase}</span>{' '}
              {vendorsToChase === 1 ? 'vendor' : 'vendors'} to follow up today.
            </>
          )}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">{formatDate(today)}</p>
      </header>

      <SnapshotStrip snapshot={snapshot} isAdmin={isAdmin} />

      {openFlags > 0 && (
        <Link
          href="/inwards"
          className="card flex items-center gap-3 border-l-4 border-l-overdue p-3.5 hover:bg-parchment/50"
        >
          <Flag className="size-5 shrink-0 text-overdue" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-charcoal">
              {openFlags} {openFlags === 1 ? 'piece' : 'pieces'} flagged at inward
            </p>
            <p className="text-[12px] text-muted">
              {isAdmin
                ? 'Wrong measurements or another problem — have a look and decide.'
                : 'Waiting for the owner to look at them.'}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted" />
        </Link>
      )}

      {nothingToDo && (
        <EmptyState
          icon={<PartyPopper />}
          title="Nothing overdue, nothing due today"
          description={
            comingUp.length > 0
              ? `Everything is on schedule. ${comingUp.length} ${comingUp.length === 1 ? 'checkpoint is' : 'checkpoints are'} coming up in the next ${COMING_UP_DAYS} days.`
              : 'Every open order is on schedule and nothing needs chasing right now.'
          }
          action={
            <Button asChild variant="outline">
              <Link href="/orders">View all orders</Link>
            </Button>
          }
        />
      )}

      {overdue.length > 0 && (
        <Band
          heading="Overdue"
          dot="bg-overdue"
          tone="text-overdue"
          count={overdue.length}
          note="Past the promised date and not yet dispatched. Oldest first."
        >
          {overdue.map((c) => (
            <FollowupCard
              key={c.order.id}
              {...c}
              urgency="overdue"
              today={today}
              whatsappTemplate={settings?.whatsapp_template_overdue || template}
            />
          ))}
        </Band>
      )}

      {dueToday.length > 0 && (
        <Band
          heading="Due today"
          dot="bg-today"
          tone="text-today"
          count={dueToday.length}
          note="Checkpoints falling today, and orders expected to dispatch today."
        >
          {dueToday.map((c) => (
            <FollowupCard key={c.order.id} {...c} urgency="today" today={today} whatsappTemplate={template} />
          ))}
        </Band>
      )}

      {missed.length > 0 && (
        <Band
          heading="Missed follow-ups"
          dot="bg-missed"
          tone="text-missed"
          count={missed.length}
          note="These checkpoints came and went without being logged. They stay here until you deal with them."
        >
          {missed.map((c) => (
            <FollowupCard key={c.order.id} {...c} urgency="missed" today={today} whatsappTemplate={template} />
          ))}
        </Band>
      )}

      {comingUp.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-1">
            <span className="size-2 rounded-full bg-upcoming" />
            <SectionHeading count={comingUp.length} className="text-upcoming">
              Coming up
            </SectionHeading>
            <ChevronRight className="size-4 text-muted transition-transform group-open:rotate-90" />
          </summary>
          <div className="card mt-2 overflow-hidden">
            {comingUp.map((c) => (
              <ComingUpRow key={c.order.id} order={c.order} followup={c.followup} today={today} />
            ))}
          </div>
        </details>
      )}

      {snapshot.openOrders === 0 && (
        <EmptyState
          icon={<CalendarCheck />}
          title="No open orders yet"
          description="Place your first order and the follow-up reminders will schedule themselves."
          action={
            <Button asChild variant="gold">
              <Link href="/orders/new">Place an order</Link>
            </Button>
          }
        />
      )}
    </>
  )
}

function Band({
  heading,
  dot,
  tone,
  count,
  note,
  children,
}: {
  heading: string
  dot: string
  tone: string
  count: number
  note: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <div>
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${dot}`} />
          <SectionHeading count={count} className={tone}>
            {heading}
          </SectionHeading>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">{note}</p>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-8 w-3/5" />
        <div className="skeleton h-4 w-2/5" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-[68px] rounded-lg" />
        ))}
      </div>
      <ListSkeleton rows={3} />
    </div>
  )
}
