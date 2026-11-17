import { Navigate } from 'react-router-dom'
import { homeFor, useAuth } from '../auth/context'

export default function Login() {
  const { session, profile, loading, signInWithGoogle } = useAuth()

  if (loading) return <p className="muted">Loading…</p>
  if (session) return <Navigate to={homeFor(profile?.role)} replace />

  return (
    <div className="card narrow">
      <h1>Watershed Foundation Dashboard</h1>
      <p>Sign in with your Google (Gmail) account.</p>
      <button className="primary" onClick={signInWithGoogle}>
        Sign in with Google
      </button>
      <p className="muted small">
        New here? After you sign in, the Foundation will review your request and choose what you can see.
      </p>
    </div>
  )
}
