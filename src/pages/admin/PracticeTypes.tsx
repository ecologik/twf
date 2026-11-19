import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loadPracticeTypes, slugify, type PracticeType } from '../../lib/practices'

type Draft = { name: string; color: string }

/** /admin/practices: the practice types staff tag map shapes with. */
export default function PracticeTypes() {
  const [types, setTypes] = useState<PracticeType[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [adding, setAdding] = useState<Draft>({ name: '', color: '#3b82c4' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const t = await loadPracticeTypes(true)
      setTypes(t)
      setDrafts(Object.fromEntries(t.map((x) => [x.id, { name: x.name, color: x.color }])))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error } = await fn()
    if (error) setError(error.message)
    await load()
    setBusy(false)
  }

  const changed = (t: PracticeType) => drafts[t.id] && (drafts[t.id].name.trim() !== t.name || drafts[t.id].color !== t.color)

  function add() {
    const name = adding.name.trim()
    const id = slugify(name)
    if (!id) return setError('Give the practice a name.')
    if (types.some((t) => t.id === id)) return setError('There is already a practice with that name.')
    const sort_order = Math.max(0, ...types.filter((t) => t.id !== 'other').map((t) => t.sort_order)) + 10
    run(() => supabase.from('practice_types').insert({ id, name, color: adding.color, sort_order })).then(() =>
      setAdding({ name: '', color: '#3b82c4' }),
    )
  }

  return (
    <>
      <h1>Practice types</h1>
      <p className="muted">
        Staff tag each shape on a project's map with one of these, and the Map section filters by them. Colours are used
        on every map and in downloaded images.
      </p>
      {error && <p className="error">{error}</p>}

      <table className="list practice-table">
        <thead>
          <tr>
            <th>Colour</th>
            <th>Name</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t.id}>
              <td>
                <input
                  type="color"
                  value={drafts[t.id]?.color ?? t.color}
                  onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...drafts[t.id], color: e.target.value } })}
                  aria-label={`${t.name} colour`}
                />
              </td>
              <td>
                <input
                  value={drafts[t.id]?.name ?? t.name}
                  onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...drafts[t.id], name: e.target.value } })}
                  aria-label="Name"
                />
              </td>
              <td className="actions">
                {changed(t) && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        supabase
                          .from('practice_types')
                          .update({ name: drafts[t.id].name.trim(), color: drafts[t.id].color })
                          .eq('id', t.id),
                      )
                    }
                  >
                    Save
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete “${t.name}”? Shapes already tagged with it keep the tag but show as "Unknown" until you re-tag them.`,
                      )
                    )
                      run(() => supabase.from('practice_types').delete().eq('id', t.id))
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <input
                type="color"
                value={adding.color}
                onChange={(e) => setAdding({ ...adding, color: e.target.value })}
                aria-label="New practice colour"
              />
            </td>
            <td>
              <input
                value={adding.name}
                onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder="New practice, e.g. Grade stabilization structure"
                aria-label="New practice name"
              />
            </td>
            <td className="actions">
              <button className="primary" disabled={busy || !adding.name.trim()} onClick={add}>
                Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
