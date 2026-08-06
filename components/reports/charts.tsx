'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Chart colours.
 *
 * The three categorical slots are a validated set — checked for colour-vision
 * separation and contrast against this app's cream surface, not picked by eye.
 * Aqua sits just under 3:1 on cream, so every chart using it also ships the
 * numbers as a table underneath.
 *
 * Delay is a status, not an identity, so it uses the reserved status ramp and
 * never the categorical slots.
 */
const SERIES = {
  placed: '#2a78d6',
  dispatched: '#eb6834',
  open: '#1baf7a',
} as const

const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const

const AXIS = '#8C877E'
const GRID = '#E5DDD0'

function delayColour(days: number): string {
  if (days <= 2) return STATUS.good
  if (days <= 7) return STATUS.warning
  if (days <= 15) return STATUS.serious
  return STATUS.critical
}

const axisProps = {
  stroke: GRID,
  tick: { fill: AXIS, fontSize: 11 },
  tickLine: false,
} as const

function TooltipBox({
  active,
  payload,
  label,
  suffix,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string; dataKey: string }[]
  label?: string
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-line bg-white px-2.5 py-2 shadow-md">
      <p className="text-[12px] font-medium text-charcoal">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink">
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ background: p.color }}
          />
          {p.name}: <span className="font-medium text-charcoal">{p.value}{suffix}</span>
        </p>
      ))}
    </div>
  )
}

/** Average delay by vendor. One series, so no legend — the title names it. */
export function DelayChart({
  data,
}: {
  data: { name: string; avgDelay: number; orders: number }[]
}) {
  return (
    <div className="card p-3">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" {...axisProps} unit="d" />
            <YAxis
              type="category"
              dataKey="name"
              width={96}
              {...axisProps}
              tick={{ fill: AXIS, fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(176,141,87,0.08)' }}
              content={<TooltipBox suffix=" days" />}
            />
            <Bar dataKey="avgDelay" name="Average delay" radius={[0, 4, 4, 0]} barSize={14}>
              {data.map((d) => (
                <Cell key={d.name} fill={delayColour(d.avgDelay)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legendish />
    </div>
  )
}

/** Average delay by vendor type. Same status encoding as above. */
export function CategoryChart({
  data,
}: {
  data: { name: string; avgDelay: number; orders: number }[]
}) {
  return (
    <div className="card p-3">
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="name" {...axisProps} interval={0} />
            <YAxis {...axisProps} unit="d" />
            <Tooltip
              cursor={{ fill: 'rgba(176,141,87,0.08)' }}
              content={<TooltipBox suffix=" days" />}
            />
            <Bar dataKey="avgDelay" name="Average delay" radius={[4, 4, 0, 0]} barSize={28}>
              {data.map((d) => (
                <Cell key={d.name} fill={delayColour(d.avgDelay)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legendish />
      <ul className="mt-2 space-y-0.5 text-[12px] text-muted">
        {data.map((d) => (
          <li key={d.name} className="flex justify-between">
            <span>{d.name}</span>
            <span className="text-ink">
              {d.avgDelay > 0 ? '+' : ''}
              {d.avgDelay}d across {d.orders} {d.orders === 1 ? 'order' : 'orders'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Delay bands, so colour never carries the meaning on its own. */
function Legendish() {
  const bands: [string, string][] = [
    ['On time (≤2d)', STATUS.good],
    ['Up to a week', STATUS.warning],
    ['Up to a fortnight', STATUS.serious],
    ['Over a fortnight', STATUS.critical],
  ]
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {bands.map(([label, colour]) => (
        <li key={label} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block size-2 rounded-full" style={{ background: colour }} />
          {label}
        </li>
      ))}
    </ul>
  )
}

/**
 * Orders placed / dispatched / still open, by month. Three series, so a legend
 * is always present, and the same numbers appear as a table underneath — that
 * table is what keeps the chart readable if the colours are hard to tell apart.
 */
export function MonthlyChart({
  data,
}: {
  data: { name: string; placed: number; dispatched: number; open: number }[]
}) {
  return (
    <div className="card p-3">
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'rgba(176,141,87,0.08)' }} content={<TooltipBox />} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: AXIS, paddingTop: 4 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="placed" name="Placed" fill={SERIES.placed} radius={[4, 4, 0, 0]} barSize={12} />
            <Bar dataKey="dispatched" name="Dispatched" fill={SERIES.dispatched} radius={[4, 4, 0, 0]} barSize={12} />
            <Bar dataKey="open" name="Still open" fill={SERIES.open} radius={[4, 4, 0, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-[12px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1 font-semibold">Month</th>
              <th className="py-1 text-right font-semibold">Placed</th>
              <th className="py-1 text-right font-semibold">Dispatched</th>
              <th className="py-1 text-right font-semibold">Still open</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.name} className="border-t border-line">
                <td className="py-1 text-charcoal">{d.name}</td>
                <td className="py-1 text-right text-ink">{d.placed}</td>
                <td className="py-1 text-right text-ink">{d.dispatched}</td>
                <td className="py-1 text-right text-ink">{d.open}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
