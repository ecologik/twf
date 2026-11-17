import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { homeFor, useAuth } from '../auth/context'

type Mode = 'signin' | 'signup' | 'forgot'

export default function Login() {
  const { session, profile, loading, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (loading) return <p className="muted">Loading…</p>
  if (session) return <Navigate to={homeFor(profile?.role)} replace />

  function switchMode(m: Mode) {
    setMode(m)
    setError(null)
    setNotice(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const addr = email.trim().toLowerCase()

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: addr, password })
      if (error) {
        setError(
          error.message === 'Email not confirmed'
            ? 'Please confirm your email first: click the link we sent you.'
            : error.message === 'Invalid login credentials'
              ? 'That email and password don’t match. If you usually use Google, sign in with Google instead.'
              : error.message,
        )
      }
    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email: addr,
        password,
        options: { emailRedirectTo: window.location.origin, data: { full_name: name.trim() || null } },
      })
      if (error) setError(error.message)
      else {
        setNotice(`Check ${addr} for a link to confirm your email. After that, the Foundation will review your request.`)
        setPassword('')
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) setError(error.message)
      else setNotice(`If ${addr} has an account, we’ve sent a link to set a new password.`)
    }
    setBusy(false)
  }

  return (
    <div className="card narrow">
      <h1>Watershed Foundation Dashboard</h1>

      <button className="primary wide" onClick={signInWithGoogle}>
        Continue with Google
      </button>

      <div className="divider">
        <span>or use your email</span>
      </div>

      <form onSubmit={onSubmit} className="stack">
        {mode === 'signup' && (
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {mode !== 'forgot' && (
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              required
            />
            {mode === 'signup' && <span className="muted small">At least 8 characters.</span>}
          </label>
        )}

        {error && <p className="error small">{error}</p>}
        {notice && <p className="notice small">{notice}</p>}

        <button type="submit" className="wide" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </form>

      <p className="small links">
        {mode === 'signin' ? (
          <>
            <button className="link" onClick={() => switchMode('signup')}>Create an account</button>
            <button className="link" onClick={() => switchMode('forgot')}>Forgot password?</button>
          </>
        ) : (
          <button className="link" onClick={() => switchMode('signin')}>Back to sign in</button>
        )}
      </p>

      <p className="muted small">
        New accounts are reviewed by the Foundation before you can see anything. <Link to="/privacy">Privacy policy</Link>
      </p>
    </div>
  )
}
