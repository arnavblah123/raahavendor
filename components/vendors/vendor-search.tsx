'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { Input, Select } from '@/components/ui/field'

export function VendorSearch({ categories }: { categories: { slug: string; label: string }[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const category = params.get('category') ?? 'all'

  // Debounced so typing on a phone does not fire a navigation per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (q) next.set('q', q)
      else next.delete('q')
      router.replace(`/vendors?${next.toString()}`, { scroll: false })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function setCategory(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') next.delete('category')
    else next.set('category', value)
    router.replace(`/vendors?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, city, contact…"
          className="pl-9"
          type="search"
        />
      </div>
      <Select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-[38%] max-w-[10rem]"
        aria-label="Filter by category"
      >
        <option value="all">All types</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.label}
          </option>
        ))}
      </Select>
    </div>
  )
}
