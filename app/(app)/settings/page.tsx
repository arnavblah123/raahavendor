import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/queries'
import { SettingsForm } from '@/components/settings/settings-form'
import { DEFAULT_WHATSAPP_TEMPLATE, CHECKPOINT_PROFILES } from '@/lib/constants'
import type { Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Settings — Raaha' }

export default async function SettingsPage() {
  const profile = await getProfile()
  // Staff have no business here; the database would refuse the writes anyway.
  if (!profile || profile.role !== 'admin') redirect('/')

  const supabase = await createClient()
  const [settings, categoriesRes, profilesRes] = await Promise.all([
    getSettings(),
    supabase.from('vendor_categories').select('*').order('sort_order'),
    supabase.from('profiles').select('*').order('full_name'),
  ])

  const fallbackProfiles = Object.fromEntries(
    Object.entries(CHECKPOINT_PROFILES).map(([k, v]) => [k, [...v.pcts]]),
  )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-3xl leading-tight text-charcoal">Settings</h1>
        <p className="mt-0.5 text-[13px] text-muted">Only you can see this page.</p>
      </header>

      <SettingsForm
        currentUserId={profile.id}
        whatsappTemplate={settings?.whatsapp_template || DEFAULT_WHATSAPP_TEMPLATE}
        whatsappTemplateOverdue={settings?.whatsapp_template_overdue || DEFAULT_WHATSAPP_TEMPLATE}
        checkpointProfiles={
          (settings?.checkpoint_profiles as Record<string, number[]>) ?? fallbackProfiles
        }
        categories={(categoriesRes.data ?? []) as { slug: string; label: string; sort_order: number; is_active: boolean }[]}
        users={(profilesRes.data ?? []) as Profile[]}
      />
    </div>
  )
}
