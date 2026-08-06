'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarCheck, ClipboardList, Plus, Store } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/', label: 'Today', icon: CalendarCheck, match: (p: string) => p === '/' },
  {
    href: '/orders',
    label: 'Orders',
    icon: ClipboardList,
    match: (p: string) => p.startsWith('/orders') && p !== '/orders/new',
  },
  { href: '/orders/new', label: 'Add', icon: Plus, match: (p: string) => p === '/orders/new' },
  { href: '/vendors', label: 'Vendors', icon: Store, match: (p: string) => p.startsWith('/vendors') },
]

/**
 * Fixed bottom navigation. Thumb-reachable, four destinations, no more.
 * Hidden on wide screens where the top bar carries the same links.
 */
export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-cream/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  active ? 'text-gold' : 'text-muted hover:text-charcoal',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={cn('size-5', active && 'stroke-[2.25]')} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
