import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { latLngBounds } from 'leaflet'
import { MapContainer, Marker, Popup } from 'react-leaflet'
import { supabase } from '../../lib/supabase'
import BaseLayers from '../../map/BaseLayers'
import HucFilter from '../../map/HucFilter'
import { hucLabel, lookupHuc, matchesHuc } from '../../map/huc'
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../map/leaflet'
import { PROJECT_COLUMNS, type Project } from './types'

const fmt = (n: number) => n.toFixed(5)

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [huc, setHuc] = useState('')
  const [filling, setFilling] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('projects')
      .select(PROJECT_COLUMNS)
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setProjects((data ?? []) as Project[])
      })
  }, [])

  const shown = useMemo(() => (projects ?? []).filter((p) => matchesHuc(p, huc)), [projects, huc])
  const pinned = useMemo(() => shown.filter((p) => p.latitude != null && p.longitude != null), [shown])
  /** Projects with a pin but no watershed yet (added before watersheds, or USGS was down). */
  const missing = useMemo(
    () => (projects ?? []).filter((p) => p.latitude != null && p.longitude != null && !p.huc10),
    [projects],
  )

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
        <button className="primary" onClick={() => navigate('/projects/new')}>+ New project</button>
      </div>
      {error && <p className="error">{error}</p>}
      {projects === null && !error && <p className="muted">Loading…</p>}

      {projects && projects.length > 0 && (
        <div className="list-filters">
          <HucFilter rows={projects} value={huc} onChange={setHuc} />
          {huc && (
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

      {projects && (
        <>
          {/* key: re-fit the map once the pins have loaded */}
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

          {projects.length === 0 ? (
            <p className="muted">No projects yet.</p>
          ) : shown.length === 0 ? (
            <p className="muted">No projects in that watershed.</p>
          ) : (
            <table className="list projects-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Location</th>
                  <th>Watershed (HUC-10)</th>
                  <th>Lat, long</th>
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
                    <td className="muted small">{p.huc10 ? hucLabel(p.huc10_name, p.huc10) : '—'}</td>
                    <td className="muted small mono">
                      {p.latitude != null && p.longitude != null ? `${fmt(p.latitude)}, ${fmt(p.longitude)}` : 'No pin yet'}
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
