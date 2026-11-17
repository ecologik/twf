import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth, type Profile, type Role } from '../../auth/context'

const ROLE_LABEL: Record<Role, string> = {
  pending: 'Waiting',
  admin: 'Admin',
  board: 'Board',
  denied: 'Denied',
}

export default function Users() {
  const { profile: me } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, role, approved_at, created_at')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setUsers((data ?? []) as Profile[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function setRole(user: Profile, role: Role) {
    setBusy(user.id)
    setError(null)
    const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id)
    if (error) setError(error.message)
    await load()
    setBusy(null)
  }

  const pending = users.filter((u) => u.role === 'pending')
  const others = users.filter((u) => u.role !== 'pending')

  const row = (u: Profile) => (
    <tr key={u.id}>
      <td>
        <strong>{u.full_name ?? '—'}</strong>
        <div className="muted small">{u.email}</div>
      </td>
      <td>
        <span className={`badge ${u.role}`}>{ROLE_LABEL[u.role]}</span>
      </td>
      <td className="muted small">{new Date(u.created_at).toLocaleDateString()}</td>
      <td className="actions">
        {u.id === me?.id ? (
          <span className="muted small">That's you</span>
        ) : (
          (['admin', 'board', 'denied'] as Role[])
            .filter((r) => r !== u.role)
            .map((r) => (
              <button key={r} disabled={busy === u.id} onClick={() => setRole(u, r)} className={r === 'denied' ? '' : 'primary'}>
                {r === 'denied' ? 'Deny' : `Make ${ROLE_LABEL[r]}`}
              </button>
            ))
        )}
      </td>
    </tr>
  )

  return (
    <>
      <h1>Users</h1>
      <p className="muted">
        Admins see the whole dashboard. Board members see only the Board section. Waiting and denied users see nothing.
      </p>
      {error && <p className="error">{error}</p>}

      <h2>Waiting for approval ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="muted">Nobody is waiting.</p>
      ) : (
        <table>
          <tbody>{pending.map(row)}</tbody>
        </table>
      )}

      <h2>Everyone else</h2>
      <table>
        <tbody>{others.map(row)}</tbody>
      </table>
    </>
  )
}
