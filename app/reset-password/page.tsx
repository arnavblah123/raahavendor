import { Suspense } from 'react'
import ResetPasswordForm from './reset-password-form'

export const metadata = { title: 'Choose a new password — Raaha' }

/**
 * Where a password-reset email lands. Reached from the "Forgot password?"
 * link on the sign-in screen, or from a reset sent by the admin in the
 * Supabase dashboard. Public: the person arriving here is, by definition,
 * not signed in.
 */
export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-cream px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-4xl leading-none text-charcoal">Raaha</h1>
          <p className="mt-1 font-serif text-lg italic text-gold">by Archana Bansal</p>
          <p className="mt-5 text-[13px] uppercase tracking-[0.18em] text-muted">New password</p>
        </div>

        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  )
}
