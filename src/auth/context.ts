import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type Role = 'pending' | 'admin' | 'board' | 'denied'

export type Profile = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: Role
  approved_at: string | null
  created_at: string
}

export type AuthState = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Where each role lands after signing in. */
export function homeFor(role: Role | undefined): string {
  if (role === 'admin') return '/'
  if (role === 'board') return '/board'
  return '/pending'
}
