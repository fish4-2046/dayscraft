import { createClient } from '@supabase/supabase-js'

export function readSupabaseConfig(env = import.meta.env) {
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY)?.trim() ?? ''
  const authRedirectUrl = env.VITE_AUTH_REDIRECT_URL?.trim() ?? ''
  return { url, key, authRedirectUrl, isConfigured: Boolean(url && key) }
}

export const supabaseConfig = readSupabaseConfig()

export const supabase = supabaseConfig.isConfigured
  ? createClient(supabaseConfig.url, supabaseConfig.key, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null

export async function getCloudSession() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session ?? null
}

export function onCloudAuthChange(callback) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

export async function signInWithEmail(email) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: supabaseConfig.authRedirectUrl || window.location.origin },
  })
  if (error) throw error
}

export async function signOutCloud() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function loadCloudState() {
  if (!supabase) return null
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const user = userData.user
  if (!user) return null

  const { data, error } = await supabase
    .from('app_state')
    .select('state')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  return data?.state ?? null
}

export async function saveCloudState(state) {
  if (!supabase) return false
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const user = userData.user
  if (!user) return false

  const { error } = await supabase.from('app_state').upsert({
    user_id: user.id,
    state,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  return true
}
