'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)

  // A password-reset email sends people to the app's front door. If this
  // load carries a reset token, hand it straight to the reset screen.
  useEffect(() => {
    const hash = window.location.hash
    const code = params.get('code')
    const tokenHash = params.get('token_hash')
    if (/type=recovery/.test(hash) || code || tokenHash) {
      const qs = new URLSearchParams()
      if (code) qs.set('code', code)
      if (tokenHash) qs.set('token_hash', tokenHash)
      window.location.replace(`/reset-password${qs.size ? `?${qs}` : ''}${hash}`)
    }
  }, [params])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'That email and password do not match. Please try again.'
          : error.message,
      )
      setBusy(false)
      return
    }

    router.replace(next)
    router.refresh()
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const supabase = createClient()
    // No redirectTo on purpose: the link then goes to the Site URL set in
    // Supabase, which needs no allow-list entry. The login screen forwards
    // it to /reset-password.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  if (forgot) {
    return (
      <form onSubmit={sendReset} className="card space-y-4 p-5">
        {sent ? (
          <>
            <p className="text-[14px] text-charcoal">Check your email.</p>
            <p className="text-[13px] leading-relaxed text-muted">
              If <strong>{email.trim()}</strong> has a login, a reset link is on its way. Open it on
              this phone or computer and choose a new password. The link works once and expires in an
              hour.
            </p>
            <Button type="button" variant="outline" size="full" onClick={() => { setForgot(false); setSent(false) }}>
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-muted">
              Enter your email and we will send you a link to choose a new password.
            </p>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@raaha.in"
              />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <Button type="submit" variant="gold" size="full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
            <button
              type="button"
              onClick={() => setForgot(false)}
              className="block w-full text-center text-[13px] font-medium text-muted hover:text-charcoal"
            >
              Back to sign in
            </button>
          </>
        )}
      </form>
    )
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@raaha.in"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <ErrorNote>{error}</ErrorNote>

      <Button type="submit" variant="gold" size="full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>

      <button
        type="button"
        onClick={() => { setForgot(true); setError(null) }}
        className="block w-full text-center text-[13px] font-medium text-muted hover:text-charcoal"
      >
        Forgot password?
      </button>
    </form>
  )
}
