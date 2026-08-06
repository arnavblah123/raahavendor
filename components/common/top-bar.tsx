'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3, LogOut, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const LINKS = [
  { href: '/', label: 'Today' },
  { href: '/orders', label: 'Orders' },
  { href: '/vendors', label: 'Vendors' },
  { href: '/reports', label: 'Reports' },
]

export function TopBar({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="shrink-0 leading-none">
          <span className="font-serif text-xl text-charcoal">Raaha</span>
          <span className="ml-1.5 hidden font-serif text-sm italic text-gold sm:inline">
            by Archana Bansal
          </span>
        </Link>

        <nav className="ml-2 hidden flex-1 items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-gold-wash text-gold' : 'text-ink hover:bg-parchment',
                )}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/reports"
            className="tap rounded-md text-muted hover:bg-parchment hover:text-charcoal md:hidden"
            aria-label="Reports"
          >
            <BarChart3 className="size-5" />
          </Link>
          {isAdmin && (
            <Link
              href="/settings"
              className="tap rounded-md text-muted hover:bg-parchment hover:text-charcoal"
              aria-label="Settings"
            >
              <Settings className="size-5" />
            </Link>
          )}
          <span className="hidden max-w-[10rem] truncate px-2 text-[13px] text-muted lg:inline">
            {name}
          </span>
          <button
            onClick={signOut}
            className="tap rounded-md text-muted hover:bg-parchment hover:text-charcoal"
            aria-label="Sign out"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
