'use client'

import { Plus, Ruler, X } from 'lucide-react'
import { Input, Select } from '@/components/ui/field'
import {
  MEASUREMENT_PRESETS,
  MEASUREMENT_UNITS,
  MEASUREMENT_UNIT_LABELS,
  type MeasurementUnit,
} from '@/lib/measurements'
import type { ProductCategory } from '@/lib/constants'

/** A row as it is being typed: the value stays a string until saved. */
export interface MeasurementRow {
  key: string
  name: string
  value: string
}

export function newMeasurementRow(name = ''): MeasurementRow {
  return { key: Math.random().toString(36).slice(2), name, value: '' }
}

/**
 * The measurements block on an order item. Quick-add chips for the usual
 * measurements of that kind of piece, plus free-typed rows for anything else.
 */
export function MeasurementsEditor({
  category,
  rows,
  unit,
  onRowsChange,
  onUnitChange,
}: {
  category: ProductCategory
  rows: MeasurementRow[]
  unit: MeasurementUnit
  onRowsChange: (rows: MeasurementRow[]) => void
  onUnitChange: (unit: MeasurementUnit) => void
}) {
  const presets = MEASUREMENT_PRESETS[category] ?? MEASUREMENT_PRESETS.other
  const used = new Set(rows.map((r) => r.name.trim().toLowerCase()))
  const available = presets.filter((p) => !used.has(p.toLowerCase()))

  function update(key: string, patch: Partial<MeasurementRow>) {
    onRowsChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  return (
    <div className="space-y-2.5 rounded-md border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <Ruler className="size-4 text-gold" />
          Measurements
        </p>
        <Select
          value={unit}
          onChange={(e) => onUnitChange(e.target.value as MeasurementUnit)}
          className="h-9 w-auto py-1 text-[13px]"
          aria-label="Measurement unit"
        >
          {MEASUREMENT_UNITS.map((u) => (
            <option key={u} value={u}>
              {MEASUREMENT_UNIT_LABELS[u]}
            </option>
          ))}
        </Select>
      </div>

      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onRowsChange([...rows, newMeasurementRow(p)])}
              className="min-h-8 rounded-full border border-line bg-parchment/60 px-2.5 text-[12px] font-medium text-ink hover:border-gold hover:text-gold"
            >
              + {p}
            </button>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <Input
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                placeholder="e.g. Waist"
                className="h-10 flex-1"
                aria-label="Measurement name"
              />
              <Input
                type="number"
                inputMode="decimal"
                step="0.25"
                min={0}
                value={r.value}
                onChange={(e) => update(r.key, { value: e.target.value })}
                placeholder={unit}
                className="h-10 w-24"
                aria-label={`${r.name || 'Measurement'} in ${MEASUREMENT_UNIT_LABELS[unit]}`}
              />
              <button
                type="button"
                onClick={() => onRowsChange(rows.filter((x) => x.key !== r.key))}
                className="tap -mr-2 rounded-md text-muted hover:text-overdue"
                aria-label={`Remove ${r.name || 'measurement'}`}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onRowsChange([...rows, newMeasurementRow()])}
        className="inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-gold hover:underline"
      >
        <Plus className="size-4" />
        Add another measurement
      </button>

      <p className="text-[12px] leading-relaxed text-muted">
        These go on the purchase order, and the piece is measured against them the day it
        arrives. Any difference gets flagged for the owner.
      </p>
    </div>
  )
}
