import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import { supabase } from '../../lib/supabase'
import BaseLayers from '../../map/BaseLayers'
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../map/leaflet'
import { colorPin } from '../../map/pins'
import { stageName } from '../projects/stages'

/**
 * One row of public.public_projects(): the only project data anonymous
 * visitors can read. Add a field here only after adding it to that function.
 */
export type PublicProject = {
  id: string
  name: string
  description: string | null
  latitude: number
  longitude: number
  stage: string
  huc10_name: string | null
  huc8_name: string | null
  practices: { name: string; color: string }[]
  sediment_tons: number | null
  phosphorus_lb: number | null
  nitrogen_lb: number | null
}

const PIN = colorPin('#0e3853') // TWF navy
const PIN_SELECTED = colorPin('#8ac641') // TWF green

const fmt1 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

/**
 * Fits the view to the pins once they arrive, keeps the chosen pin out from
 * under the drawer, and closes the drawer on a click on the map itself.
 */
function MapBehaviour({
  projects,
  selected,
  onBackground,
}: {
  projects: PublicProject[]
  selected: PublicProject | null
  onBackground: () => void
}) {
  const map = useMap()
  useEffect(() => {
    if (!selected) return
    const size = map.getSize()
    const phone = size.x <= 640
    // The drawer is 380px wide on the right, or a sheet over the bottom 75% on a phone.
    map.panInside([selected.latitude, selected.longitude], {
      paddingTopLeft: [40, 40],
      paddingBottomRight: phone ? [40, size.y * 0.75 + 30] : [Math.min(380, size.x) + 40, 40],
    })
  }, [map, selected])
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || projects.length === 0) return
    fitted.current = true
    if (projects.length === 1) map.setView([projects[0].latitude, projects[0].longitude], 13)
    else map.fitBounds(L.latLngBounds(projects.map((p) => [p.latitude, p.longitude])).pad(0.15), { maxZoom: 14 })
  }, [map, projects])
  useMapEvents({ click: onBackground })
  return null
}

function Drawer({ project, onClose }: { project: PublicProject; onClose: () => void }) {
  const hasLoad = project.sediment_tons != null || project.phosphorus_lb != null || project.nitrogen_lb != null
  return (
    <aside className="public-drawer" aria-label={project.name}>
      <div className="public-drawer-head">
        <div>
          <div className="public-drawer-stage">{stageName(project.stage)}</div>
          <h2>{project.name}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="public-drawer-body">
        {/* Cover photo goes here once covers come from the project's Drive folder. */}
        <div className="public-drawer-photo muted small">Photo coming soon</div>

        {project.practices.length > 0 && (
          <div className="type-tags">
            {project.practices.map((p) => (
              <span key={p.name} className="type-tag">
                <span className="swatch" style={{ background: p.color }} />
                {p.name}
              </span>
            ))}
          </div>
        )}

        {project.description ? (
          <p className="public-drawer-text">{project.description}</p>
        ) : (
          <p className="muted small">A description of this project is coming soon.</p>
        )}

        {project.huc10_name && (
          <dl className="public-drawer-facts">
            <div>
              <dt>Watershed</dt>
              <dd>
                {project.huc10_name}
                {project.huc8_name && <span className="muted"> in the {project.huc8_name} basin</span>}
              </dd>
            </div>
          </dl>
        )}

        {hasLoad && (
          <section className="public-drawer-load">
            <h3>Pollution kept out of the water each year</h3>
            <div className="load-banner-values">
              {(
                [
                  ['Sediment', project.sediment_tons, 'tons'],
                  ['Phosphorus', project.phosphorus_lb, 'lb'],
                  ['Nitrogen', project.nitrogen_lb, 'lb'],
                ] as const
              ).map(([label, v, unit]) => (
                <div key={label}>
                  <div className="muted small">{label}</div>
                  <div className="load-banner-value">{v == null ? '—' : fmt1(Number(v))}</div>
                  <div className="muted small">{unit}</div>
                </div>
              ))}
            </div>
            <p className="muted small">Estimated with the EPA Region 5 load reduction model.</p>
          </section>
        )}
      </div>
    </aside>
  )
}

/**
 * The public section: one pin per project marked "Show on public site", and a
 * drawer from the right with that project's story. Open to everyone, signed
 * in or not; the data comes only from public.public_projects().
 */
export default function PublicMap() {
  const [projects, setProjects] = useState<PublicProject[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('public_projects').then(({ data, error }) => {
      if (error) setError(error.message)
      else setProjects((data ?? []) as PublicProject[])
    })
  }, [])

  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedId(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  const selected = useMemo(() => projects?.find((p) => p.id === selectedId) ?? null, [projects, selectedId])

  return (
    <div className="public-page">
      <div className="page-head">
        <div>
          <h1>Our projects</h1>
          <p className="muted public-intro">
            Conservation practices The Watershed Foundation has helped put on the ground. Click a pin to read about the
            project.
          </p>
        </div>
      </div>
      {error && <p className="error">Couldn't load the projects ({error}).</p>}

      <div className={`public-map-wrap${selected ? ' drawer-open' : ''}`}>
        <MapContainer className="map public" center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom>
          <BaseLayers />
          <MapBehaviour projects={projects ?? []} selected={selected} onBackground={() => setSelectedId(null)} />
          {(projects ?? []).map((p) => (
            <Marker
              key={p.id}
              position={[p.latitude, p.longitude]}
              icon={p.id === selectedId ? PIN_SELECTED : PIN}
              zIndexOffset={p.id === selectedId ? 1000 : 0}
              title={p.name}
              eventHandlers={{ click: () => setSelectedId(p.id) }}
            />
          ))}
        </MapContainer>
        {selected && <Drawer key={selected.id} project={selected} onClose={() => setSelectedId(null)} />}
        {projects && projects.length === 0 && (
          <div className="public-empty card">No projects are on the public map yet.</div>
        )}
      </div>
    </div>
  )
}
