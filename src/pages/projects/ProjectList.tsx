import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { latLngBounds } from 'leaflet'
import { MapContainer, Marker, Popup } from 'react-leaflet'
import { supabase } from '../../lib/supabase'
import { UNSET_COLOR, usePracticeTypes } from '../../lib/practices'
import BaseLayers from '../../map/BaseLayers'
import HucFilter from '../../map/HucFilter'
import { hucLabel, lookupHuc, matchesHuc } from '../../map/huc'
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../map/leaflet'
import { StageCell } from './StageBar'
import { STAGES } from './stages'
import { PROJECT_COLUMNS, type Project } from './types'

const NONE = '__none__'

/** Folded-map icon for the Show map button. */
function MapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  )
}

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [huc, setHuc] = useState('')
  const [filling, setFilling] = useState<string | null>(null)
  const { types } = usePracticeTypes()
  const [loadTypes, setLoadTypes] = useState<{ project_id: string; practice_type: string | null }[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set()) // practice type pills; empty = all
  const [stages, setStages] = useState<Set<string>>(new Set()) // stage pills; empty = all
  const [showMap, setShowMap] = useState(false)

  useEffect(() => {
    supabase
      .from('projects')
      .select(PROJECT_COLUMNS)
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setProjects((data ?? []) as Project[])
      })
    supabase
      .from('load_model_entries')
      .select('project_id, practice_type')
      .then(({ data }) => setLoadTypes(data ?? []))
  }, [])

  /**
   * A project's types: the practice types of the shapes on its Map tab and of
   * its load model entries, in the admin list's order.
   */
  const typesOf = useMemo(() => {
    const m = new Map<string, Set<string>>()
    const add = (id: string, t: unknown) => {
      if (typeof t !== 'string' || !t) return
      if (!m.has(id)) m.set(id, new Set())
      m.get(id)!.add(t)
    }
    for (const p of projects ?? []) for (const f of p.map_shapes?.features ?? []) add(p.id, f.properties?.practice)
    for (const l of loadTypes) add(l.project_id, l.practice_type)
    const order = new Map(types.map((t, i) => [t.id, i]))
    return (id: string) =>
      [...(m.get(id) ?? [])].filter((t) => order.has(t)).sort((a, b) => order.get(a)! - order.get(b)!)
  }, [projects, loadTypes, types])

  /** Pills: each type that some project in the watershed has, plus "No type yet". */
  const inWatershed = useMemo(() => (projects ?? []).filter((p) => matchesHuc(p, huc)), [projects, huc])
  const pills = useMemo(() => {
    const count = new Map<string, number>()
    for (const p of inWatershed) {
      const ts = typesOf(p.id)
      for (const t of ts.length ? ts : [NONE]) count.set(t, (count.get(t) ?? 0) + 1)
    }
    return [
      ...types.filter((t) => count.has(t.id)).map((t) => ({ key: t.id, name: t.name, color: t.color, n: count.get(t.id)! })),
      ...(count.has(NONE) ? [{ key: NONE, name: 'No type yet', color: UNSET_COLOR, n: count.get(NONE)! }] : []),
    ]
  }, [inWatershed, typesOf, types])
  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t])), [types])

  const stagePills = useMemo(
    () =>
      STAGES.map((st) => ({ ...st, n: inWatershed.filter((p) => p.stage === st.id).length })).filter((st) => st.n > 0),
    [inWatershed],
  )

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }

  // A project shows if it has any of the picked types.
  const shown = useMemo(
    () =>
      inWatershed.filter((p) => {
        if (stages.size && !stages.has(p.stage)) return false
        if (!picked.size) return true
        const ts = typesOf(p.id)
        return ts.length ? ts.some((t) => picked.has(t)) : picked.has(NONE)
      }),
    [inWatershed, picked, stages, typesOf],
  )
  const pinned = useMemo(() => shown.filter((p) => p.latitude != null && p.longitude != null), [shown])
  /** Projects with a pin but no watershed yet (added before watersheds, or USGS was down). */
  const missing = useMemo(
    () => (projects ?? []).filter((p) => p.latitude != null && p.longitude != null && !p.huc10),
    [projects],
  )

  /** The Public column's checkbox saves straight away. */
  async function setPublic(p: Project, on: boolean) {
    setError(null)
    setProjects((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, is_public: on } : x)))
    const { error } = await supabase.from('projects').update({ is_public: on }).eq('id', p.id)
    if (error) {
      setProjects((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, is_public: !on } : x)))
      setError(`Couldn't change "${p.name}": ${error.message}`)
    }
  }

  async function fillMissing() {
    setError(null)
    let done = 0
    let notFound = 0
    for (const p of missing) {
      setFilling(`Looking up ${done + 1} of ${missing.length}…`)
      try {
        const h = await lookupHuc(p.latitude!, p.longitude!)
        if (!h) {
          notFound++
        } else {
          const { error } = await supabase.from('projects').update(h).eq('id', p.id)
          if (error) throw new Error(error.message)
          setProjects((prev) =>
            (prev ?? []).map((x) => (x.id === p.id ? { ...x, ...h, huc8: h.huc10.slice(0, 8) } : x)),
          )
        }
      } catch (e) {
        setError(`Stopped at “${p.name}”: ${e instanceof Error ? e.message : e}`)
        break
      }
      done++
    }
    setFilling(null)
    if (notFound) setError(`${notFound} ${notFound === 1 ? 'pin is' : 'pins are'} outside the US watershed map.`)
  }
  const bounds = useMemo(
    () => (pinned.length > 1 ? latLngBounds(pinned.map((p) => [p.latitude!, p.longitude!])).pad(0.15) : undefined),
    [pinned],
  )

  return (
    <>
      <div className="page-head">
        <h1>Projects</h1>
        <div className="form-actions">
          <button
            type="button"
            className={`map-toggle${showMap ? ' active' : ''}`}
            onClick={() => setShowMap((v) => !v)}
            aria-pressed={showMap}
          >
            <MapIcon /> {showMap ? 'Hide map' : 'Show map'}
          </button>
          <button className="primary" onClick={() => navigate('/projects/new')}>+ New project</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {projects === null && !error && <p className="muted">Loading…</p>}

      {projects && projects.length > 0 && (
        <div className="list-filters">
          <HucFilter rows={projects} value={huc} onChange={setHuc} />
          {(huc || picked.size > 0 || stages.size > 0) && (
            <span className="muted small">
              {shown.length} of {projects.length} projects
            </span>
          )}
          {missing.length > 0 && (
            <button type="button" onClick={fillMissing} disabled={filling !== null}>
              {filling ?? `Find watersheds for ${missing.length} ${missing.length === 1 ? 'project' : 'projects'}`}
            </button>
          )}
        </div>
      )}

      {stagePills.length > 0 && (
        <div className="pill-row" role="group" aria-label="Filter by stage">
          <span className="pill-label">Stage</span>
          <button type="button" className={`pill${stages.size === 0 ? ' on' : ''}`} onClick={() => setStages(new Set())}>
            All
          </button>
          {stagePills.map((st) => (
            <button
              key={st.id}
              type="button"
              className={`pill${stages.has(st.id) ? ' on' : ''}`}
              onClick={() => setStages(toggle(stages, st.id))}
              aria-pressed={stages.has(st.id)}
            >
              {st.name}
              <span className="pill-count">{st.n}</span>
            </button>
          ))}
        </div>
      )}

      {pills.length > 0 && (
        <div className="pill-row" role="group" aria-label="Filter by project type">
          <span className="pill-label">Type</span>
          <button type="button" className={`pill${picked.size === 0 ? ' on' : ''}`} onClick={() => setPicked(new Set())}>
            All
          </button>
          {pills.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`pill${picked.has(p.key) ? ' on' : ''}`}
              onClick={() => setPicked(toggle(picked, p.key))}
              aria-pressed={picked.has(p.key)}
            >
              <span className="swatch" style={{ background: p.color }} />
              {p.name}
              <span className="pill-count">{p.n}</span>
            </button>
          ))}
        </div>
      )}

      {projects && (
        <>
          {/* key: re-fit the map once the pins have loaded */}
          {showMap && (
          <MapContainer
            key={`${huc}:${pinned.length}`}
            className="map overview"
            bounds={bounds}
            center={bounds ? undefined : pinned[0] ? [pinned[0].latitude!, pinned[0].longitude!] : DEFAULT_CENTER}
            zoom={bounds ? undefined : DEFAULT_ZOOM}
            scrollWheelZoom={false}
          >
            <BaseLayers highlight={huc.startsWith('10:') ? huc.slice(3) : null} />
            {pinned.map((p) => (
              <Marker key={p.id} position={[p.latitude!, p.longitude!]}>
                <Popup>
                  <strong>{p.name}</strong>
                  {p.location && <div>{p.location}</div>}
                  <Link to={`/projects/${p.id}`}>Edit</Link>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          )}

          {projects.length === 0 ? (
            <p className="muted">No projects yet.</p>
          ) : shown.length === 0 ? (
            <p className="muted">No projects match those filters.</p>
          ) : (
            <table className="list projects-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Location</th>
                  <th>Stage</th>
                  <th>Watershed (HUC-10)</th>
                  <th>Project type</th>
                  <th className="public-col" title="Shown on the public map">Public</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td>
                      <Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()}>
                        <strong>{p.name}</strong>
                      </Link>
                    </td>
                    <td className="muted">{p.location ?? '—'}</td>
                    <td>
                      <StageCell stage={p.stage} />
                    </td>
                    <td className="muted small">{p.huc10 ? hucLabel(p.huc10_name, p.huc10) : '—'}</td>
                    <td>
                      {typesOf(p.id).length ? (
                        <span className="type-tags">
                          {typesOf(p.id).map((t) => (
                            <span key={t} className="type-tag">
                              <span className="swatch" style={{ background: typeName.get(t)?.color }} />
                              {typeName.get(t)?.name}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                    <td className="public-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={p.is_public}
                        onChange={(e) => setPublic(p, e.target.checked)}
                        aria-label={`Show ${p.name} on the public site`}
                        title={p.latitude == null ? 'Needs a location before it shows on the public map' : 'Show on the public map'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  )
}
