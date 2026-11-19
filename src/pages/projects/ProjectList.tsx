import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { latLngBounds } from 'leaflet'
import { MapContainer, Marker, Popup } from 'react-leaflet'
import { supabase } from '../../lib/supabase'
import BaseLayers from '../../map/BaseLayers'
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../map/leaflet'
import { PROJECT_COLUMNS, type Project } from './types'

const fmt = (n: number) => n.toFixed(5)

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const pinned = useMemo(
    () => (projects ?? []).filter((p) => p.latitude != null && p.longitude != null),
    [projects],
  )
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

      {projects && (
        <>
          {/* key: re-fit the map once the pins have loaded */}
          <MapContainer
            key={pinned.length}
            className="map overview"
            bounds={bounds}
            center={bounds ? undefined : pinned[0] ? [pinned[0].latitude!, pinned[0].longitude!] : DEFAULT_CENTER}
            zoom={bounds ? undefined : DEFAULT_ZOOM}
            scrollWheelZoom={false}
          >
            <BaseLayers />
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
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Location</th>
                  <th>Lat, long</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td>
                      <Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()}>
                        <strong>{p.name}</strong>
                      </Link>
                    </td>
                    <td className="muted">{p.location ?? '—'}</td>
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
