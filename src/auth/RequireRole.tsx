import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { homeFor, useAuth, type Role } from './context'

/**
 * Shows children only to signed-in users whose role is in `allow`.
 * This is for a sensible UI only: the real protection is RLS in the database.
 */
export default function RequireRole({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="muted">Loading…</p>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile || !allow.includes(profile.role)) return <Navigate to={homeFor(profile?.role)} replace />
  return <>{children}</>
}
