import { Suspense } from 'react'
import LoginForm from './login-form'

export const metadata = { title: 'Sign in — Raaha' }

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-cream px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-4xl leading-none text-charcoal">Raaha</h1>
          <p className="mt-1 font-serif text-lg italic text-gold">by Archana Bansal</p>
          <p className="mt-5 text-[13px] uppercase tracking-[0.18em] text-muted">Vendor Tracker</p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <p className="mt-8 text-center text-xs leading-relaxed text-muted">
          For Raaha staff only. If you do not have a login, ask Archana to create one for you.
        </p>
      </div>
    </main>
  )
}
