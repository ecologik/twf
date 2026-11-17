import { Navigate } from 'react-router-dom'
import { homeFor, useAuth } from '../auth/context'

export default function Pending() {
  const { session, profile, loading, signOut, refreshProfile } = useAuth()

  if (loading) return <p className="muted">Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  if (profile && (profile.role === 'admin' || profile.role === 'board')) {
    return <Navigate to={homeFor(profile.role)} replace />
  }

  const denied = profile?.role === 'denied'

  return (
    <div className="card narrow">
      <h1>{denied ? 'Access not approved' : 'Waiting for approval'}</h1>
      {denied ? (
        <p>Your request to use the dashboard wasn't approved. If you think that's a mistake, contact the Watershed Foundation.</p>
      ) : (
        <>
          <p>
            Thanks, {profile?.full_name ?? session.user.email}. The Foundation has been notified and will choose your
            access soon.
          </p>
          <p className="muted small">Signed in as {session.user.email}</p>
          <button onClick={refreshProfile}>Check again</button>{' '}
        </>
      )}
      <button onClick={signOut}>Sign out</button>
    </div>
  )
}
