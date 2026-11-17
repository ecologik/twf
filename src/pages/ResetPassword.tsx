import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { homeFor, useAuth } from '../auth/context'

/** Landing page for the "reset your password" email link. */
export default function ResetPassword() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <p className="muted">Loading…</p>

  if (!session) {
    return (
      <div className="card narrow">
        <h1>Link expired</h1>
        <p>This reset link has expired or was opened in a different browser. Request a new one from the sign-in page.</p>
        <Link to="/login">Back to sign in</Link>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else navigate(homeFor(profile?.role), { replace: true })
  }

  return (
    <div className="card narrow">
      <h1>Set a new password</h1>
      <form onSubmit={onSubmit} className="stack">
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="muted small">At least 8 characters.</span>
        </label>
        {error && <p className="error small">{error}</p>}
        <button type="submit" className="primary wide" disabled={busy}>Save password</button>
      </form>
    </div>
  )
}
