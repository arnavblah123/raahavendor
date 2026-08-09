/**
 * Supabase connection settings.
 *
 * Supabase renamed its browser-safe key. Projects created before November 2025
 * have an "anon public" key; newer projects have a "publishable" key starting
 * with `sb_publishable_`. They go in exactly the same place and behave the same
 * way — both are safe in a browser, and Row Level Security is what actually
 * protects the data either way.
 *
 * We accept either environment variable name so the setup instructions work
 * whichever kind of project you have.
 */

/**
 * Clean up a pasted Project URL.
 *
 * Copying from the dashboard very easily picks up a trailing slash, and it is
 * an easy slip to paste the dashboard address instead. Neither is obvious from
 * the resulting error: supabase-js strips a single trailing slash but not two,
 * and never strips a path, so the request goes to `//auth/v1/token` or
 * `/dashboard/auth/v1/token` and Supabase's gateway answers with the
 * unhelpful "Invalid path specified in request URL".
 *
 * Rather than let that reach the user, normalise the value here.
 */
export function normaliseSupabaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''

  // Strip any number of trailing slashes.
  const noTrailing = trimmed.replace(/\/+$/, '')

  try {
    const url = new URL(noTrailing)
    // A hosted Supabase project is always served from the bare origin, so any
    // path on one of their domains is a paste error.
    if (/\.supabase\.(co|in|red)$/i.test(url.hostname)) {
      return url.origin
    }
    return noTrailing
  } catch {
    // Not a parseable URL — hand it back and let assertSupabaseEnv complain.
    return noTrailing
  }
}

export const SUPABASE_URL = normaliseSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)

export const SUPABASE_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''
).trim()

/**
 * Fail loudly at startup rather than with a confusing "fetch failed" on the
 * first query. A missing key is the single most likely setup mistake.
 */
export function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and fill in ' +
        'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        '(older projects: NEXT_PUBLIC_SUPABASE_ANON_KEY). See README step 4.',
    )
  }
}
