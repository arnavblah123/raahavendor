'use client'

import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_KEY, SUPABASE_URL, assertSupabaseEnv } from './env'

export function createClient() {
  assertSupabaseEnv()
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
}
