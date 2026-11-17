import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext, type AuthState, type Profile } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, role, approved_at, created_at')
      .eq('id', s.user.id)
      .maybeSingle()
    if (error) console.error('Could not load profile', error)
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Don't await Supabase calls inside this callback (it can deadlock);
      // run them on the next tick instead.
      setTimeout(() => {
        loadProfile(s).finally(() => active && setLoading(false))
      }, 0)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      signInWithGoogle: async () => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
            queryParams: { prompt: 'select_account' },
          },
        })
        if (error) alert(error.message)
      },
      signOut: async () => {
        await supabase.auth.signOut()
        setProfile(null)
      },
      refreshProfile: () => loadProfile(session),
    }),
    [session, profile, loading, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
