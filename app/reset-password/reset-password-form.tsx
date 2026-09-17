'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { createClient } from '@/lib/supabase/client'

type Stage = 'checking' | 'ready' | 'invalid' | 'done'

/**
 * A reset link can arrive in three shapes depending on who sent it:
 *   ?code=…                  from "Forgot password?" in this app
 *   ?token_hash=…&type=…     from a customised email template
 *   #access_token=…          from a reset sent in the Supabase dashboard
 * All three end the same way: a signed-in session, then a new password.
 */
export default function ResetPasswordForm() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const supabase = createClient()
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const tokenHash = url.searchParams.get('token_hash')

    let settled = false
    const ok = () => {
      if (settled) return
      settled = true
      setStage('ready')
      // Drop the token from the address bar so a refresh cannot replay it.
      window.history.replaceState({}, '', '/reset-password')
    }
    const bad = () => {
      if (settled) return
      settled = true
      setStage('invalid')
    }

    // The hash form is picked up by the client itself; this hears about it.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) ok()
    })

    ;(async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) bad()
        else ok()
        return
      }
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (error) bad()
        else ok()
        return
      }
      // Hash form, or someone already signed in who just wants a new password.
      const { data } = await supabase.auth.getSession()
      if (data.session) ok()
      // Give the hash a moment to be processed before giving up.
      else setTimeout(async () => {
        const { data } = await supabase.auth.getSession()
        if (data.session) ok()
        else bad()
      }, 1500)
    })()

    return () => sub.subscription.unsubscribe()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) return setError('Use at least 6 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')

    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    setStage('done')
    setTimeout(() => {
      router.replace('/')
      router.refresh()
    }, 1200)
  }

  if (stage === 'checking') {
    return (
      <div className="card flex items-center justify-center gap-2 p-6 text-[13px] text-muted">
        <Loader2 className="size-4 animate-spin" />
        Checking your link…
      </div>
    )
  }

  if (stage === 'invalid') {
    return (
      <div className="card space-y-3 p-5">
        <p className="text-[14px] text-charcoal">This reset link has expired or was already used.</p>
        <p className="text-[13px] leading-relaxed text-muted">
          Links work once and only for an hour. Go back to sign in and tap{' '}
          <strong>Forgot password?</strong> to get a fresh one.
        </p>
        <Button asChild variant="gold" size="full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    )
  }

  if (stage === 'done') {
    return (
      <div className="card p-5 text-center text-[14px] text-charcoal">
        Password changed. Taking you in…
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <p className="text-[13px] leading-relaxed text-muted">
        Choose a new password. You will be signed in straight away.
      </p>
      <Field label="New password" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Type it again" htmlFor="confirm">
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="gold" size="full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {busy ? 'Saving…' : 'Save new password'}
      </Button>
    </form>
  )
}
