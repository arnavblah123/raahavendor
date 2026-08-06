import { requireProfile } from '@/lib/auth'
import { TopBar } from '@/components/common/top-bar'
import { BottomNav } from '@/components/common/bottom-nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()

  return (
    <div className="min-h-dvh bg-cream">
      <TopBar name={profile.full_name} isAdmin={profile.role === 'admin'} />

      {/* Bottom padding clears the fixed mobile nav. */}
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 md:pb-12">{children}</main>

      <BottomNav />
    </div>
  )
}
