import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_KEY, SUPABASE_URL, assertSupabaseEnv } from './env'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

/**
 * Supabase client for Server Components and Server Actions.
 * Always `await createClient()` — cookies() is async in Next 15.
 */
export async function createClient() {
  assertSupabaseEnv()
  const cookieStore = await cookies()

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Components cannot set cookies. The middleware refreshes
            // the session, so this is safe to ignore.
          }
        },
      },
    },
  )
}
