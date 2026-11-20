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

/** Width of the drawer in px (keep in step with .public-drawer in index.css). */
const DRAWER_WIDTH = 420
/** Longest description shown on a card before it is cut with an ellipsis. */
const CARD_DESCRIPTION_CHARS = 160

/** Cuts text at a word boundary to at most `max` characters, adding an ellipsis. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:–-]+$/, '')}…`
}

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
    // The drawer covers the browser's right edge; keep the pin in the part of
    // the map it doesn't cover (if any of the map is left uncovered).
    const box = map.getContainer().getBoundingClientRect()
    const drawerLeft = window.innerWidth - Math.min(DRAWER_WIDTH, window.innerWidth)
    const covered = Math.max(0, box.right - drawerLeft)
    if (covered > box.width - 120) return
    map.panInside([selected.latitude, selected.longitude], {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [covered + 40, 40],
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

/** Stand-in for the project's cover photo until covers come from its Drive folder. */
function Photo({ project, className }: { project: PublicProject; className: string }) {
  const tint = project.practices[0]?.color ?? '#56724a'
  return (
    <div className={`public-photo ${className}`} style={{ ['--tint' as string]: tint }} aria-hidden="true">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
      </svg>
    </div>
  )
}

function Card({ project, active, onOpen }: { project: PublicProject; active: boolean; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className={`public-card${active ? ' active' : ''}`} onClick={onOpen} aria-haspopup="dialog">
        <Photo project={project} className="public-card-photo" />
        <div className="public-card-body">
          <h2>{project.name}</h2>
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
          <p className={project.description ? '' : 'muted'}>
            {project.description ? clip(project.description, CARD_DESCRIPTION_CHARS) : 'Description coming soon.'}
          </p>
          <span className="public-card-more">Read more</span>
        </div>
      </button>
    </li>
  )
}

function Drawer({ project, onClose }: { project: PublicProject; onClose: () => void }) {
  const hasLoad = project.sediment_tons != null || project.phosphorus_lb != null || project.nitrogen_lb != null
  return (
    <aside className="public-drawer" role="dialog" aria-label={project.name}>
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
        <Photo project={project} className="public-drawer-photo" />

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
            Conservation practices The Watershed Foundation has helped put on the ground. Click a pin or a card to read
            about the project.
          </p>
        </div>
      </div>
      {error && <p className="error">Couldn't load the projects ({error}).</p>}

      <div className="public-map-wrap">
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
        {projects && projects.length === 0 && (
          <div className="public-empty card">No projects are on the public map yet.</div>
        )}
      </div>

      {projects && projects.length > 0 && (
        <ul className="public-cards" aria-label="Projects">
          {projects.map((p) => (
            <Card key={p.id} project={p} active={p.id === selectedId} onOpen={() => setSelectedId(p.id)} />
          ))}
        </ul>
      )}

      {selected && <Drawer key={selected.id} project={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}
