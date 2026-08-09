import { describe, expect, it } from 'vitest'
import { normaliseSupabaseUrl } from '../lib/supabase/env'

/**
 * These all produce "Invalid path specified in request URL" at sign-in if the
 * value reaches supabase-js unchanged — a message that gives no hint that the
 * URL is at fault.
 */
describe('normaliseSupabaseUrl', () => {
  it('leaves a correct URL alone', () => {
    expect(normaliseSupabaseUrl('https://abcdefghijkl.supabase.co')).toBe(
      'https://abcdefghijkl.supabase.co',
    )
  })

  it('strips trailing slashes, however many', () => {
    expect(normaliseSupabaseUrl('https://abcdefghijkl.supabase.co/')).toBe(
      'https://abcdefghijkl.supabase.co',
    )
    expect(normaliseSupabaseUrl('https://abcdefghijkl.supabase.co//')).toBe(
      'https://abcdefghijkl.supabase.co',
    )
    expect(normaliseSupabaseUrl('https://abcdefghijkl.supabase.co///')).toBe(
      'https://abcdefghijkl.supabase.co',
    )
  })

  it('strips stray whitespace from a copy-paste', () => {
    expect(normaliseSupabaseUrl('  https://abcdefghijkl.supabase.co/  ')).toBe(
      'https://abcdefghijkl.supabase.co',
    )
  })

  it('drops a path on a hosted Supabase domain', () => {
    expect(normaliseSupabaseUrl('https://abcdefghijkl.supabase.co/rest/v1')).toBe(
      'https://abcdefghijkl.supabase.co',
    )
    expect(normaliseSupabaseUrl('https://abcdefghijkl.supabase.co/dashboard')).toBe(
      'https://abcdefghijkl.supabase.co',
    )
  })

  it('keeps the path for a self-hosted instance', () => {
    expect(normaliseSupabaseUrl('https://db.mycompany.com/supabase')).toBe(
      'https://db.mycompany.com/supabase',
    )
    expect(normaliseSupabaseUrl('http://localhost:8000')).toBe('http://localhost:8000')
  })

  it('handles empty and unparseable values without throwing', () => {
    expect(normaliseSupabaseUrl(undefined)).toBe('')
    expect(normaliseSupabaseUrl('')).toBe('')
    expect(normaliseSupabaseUrl('   ')).toBe('')
    expect(normaliseSupabaseUrl('not a url')).toBe('not a url')
  })
})
