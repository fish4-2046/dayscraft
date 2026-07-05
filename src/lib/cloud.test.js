import { describe, expect, it } from 'vitest'
import { readSupabaseConfig } from './cloud'

describe('readSupabaseConfig', () => {
  it('accepts the new browser-safe publishable key', () => {
    const config = readSupabaseConfig({
      VITE_SUPABASE_URL: ' https://example.supabase.co ',
      VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_x ',
    })

    expect(config).toEqual({
      url: 'https://example.supabase.co',
      key: 'sb_publishable_x',
      authRedirectUrl: '',
      isConfigured: true,
    })
  })

  it('keeps compatibility with the legacy anon env name', () => {
    const config = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'ey_anon',
    })

    expect(config.key).toBe('ey_anon')
    expect(config.isConfigured).toBe(true)
  })

  it('stays disabled until both values exist', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' }).isConfigured).toBe(false)
    expect(readSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }).isConfigured).toBe(false)
  })

  it('reads an explicit auth redirect URL for production magic links', () => {
    const config = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      VITE_AUTH_REDIRECT_URL: ' https://dayscraft.vercel.app ',
    })

    expect(config.authRedirectUrl).toBe('https://dayscraft.vercel.app')
  })
})
