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

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''

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
