import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import type { Feature, FeatureCollection } from 'geojson'
import { MapContainer, useMap } from 'react-leaflet'
import { supabase } from '../../lib/supabase'
import { UNSET_COLOR, usePracticeTypes } from '../../lib/practices'
import BaseLayers from '../../map/BaseLayers'
import HucFilter from '../../map/HucFilter'
import { hucFilterName, matchesHuc, type HucFields } from '../../map/huc'
import { downloadBlob, mapToPng, type ExportShape } from '../../map/exportPng'
import { DEFAULT_CENTER, DEFAULT_ZOOM, PIN_ICON } from '../../map/leaflet'
import { colorPin, styleFor } from '../../map/pins'

type Row = HucFields & {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  map_shapes: FeatureCollection | null
}
type Item = { project: Row; feature: Feature; practice: string | null; label: string }
type Load = {
  project_id: string
  practice_type: string | null
  sediment_tons: number | null
  phosphorus_lb: number | null
  nitrogen_lb: number | null
}
type Totals = { sed: number; p: number; n: number; entries: number; noSed: number; projects: Set<string> }

function totalsOf(list: Load[]): Totals {
  const t: Totals = { sed: 0, p: 0, n: 0, entries: 0, noSed: 0, projects: new Set() }
  for (const l of list) {
    t.sed += l.sediment_tons ?? 0
    t.p += l.phosphorus_lb ?? 0
    t.n += l.nitrogen_lb ?? 0
    if (l.sediment_tons == null) t.noSed++
    t.entries++
    t.projects.add(l.project_id)
  }
  return t
}
const fmt1 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })
const short = (t: Totals) =>
  `${t.noSed === t.entries ? 'no sediment figure' : `${fmt1(t.sed)} t`} · ${fmt1(t.p)} lb P · ${fmt1(t.n)} lb N`

const NONE = '__none__'

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Draws the filtered shapes (and optionally project pins) and fits the view. */
function Layers({
  items,
  pins,
  loadOf,
  colorOf,
  nameOf,
  onLayers,
}: {
  items: Item[]
  pins: Row[]
  loadOf: (projectId: string) => Totals | null
  colorOf: (p: string | null) => string
  nameOf: (p: string | null) => string
  onLayers: (l: ExportShape[]) => void
}) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    const group = L.featureGroup().addTo(map)
    const drawn: ExportShape[] = []

    for (const it of items) {
      const color = colorOf(it.practice)
      L.geoJSON(it.feature, {
        pointToLayer: (_f, ll) => L.marker(ll, { icon: colorPin(color) }),
        onEachFeature: (_f, layer) => {
          styleFor(layer, color)
          layer.bindPopup(
            `<strong>${escapeHtml(it.project.name)}</strong>` +
              `<div>${escapeHtml(nameOf(it.practice))}${it.label ? ` · ${escapeHtml(it.label)}` : ''}</div>` +
              `<a href="/projects/${it.project.id}?tab=map">Open project map</a>`,
          )
          group.addLayer(layer)
          drawn.push({
            layer,
            color,
            number: drawn.length + 1,
            name: it.project.name,
            practice: nameOf(it.practice),
          })
        },
      })
    }
    for (const p of pins) {
      const m = L.marker([p.latitude!, p.longitude!], { icon: PIN_ICON })
      const t = loadOf(p.id)
      m.bindPopup(
        `<strong>${escapeHtml(p.name)}</strong>` +
          (t ? `<div>Load reduction: ${escapeHtml(short(t))} per yr</div>` : '') +
          `<div><a href="/projects/${p.id}${t ? '?tab=load' : ''}">Open project</a></div>`,
      )
      group.addLayer(m)
    }
    onLayers(drawn)

    const b = group.getBounds()
    if (b.isValid() && (!fitted.current || items.length + pins.length > 0)) {
      map.fitBounds(b.pad(0.15), { maxZoom: 16 })
      fitted.current = true
    }
    return () => {
      group.remove()
    }
  }, [map, items, pins, loadOf, colorOf, nameOf, onLayers])

  return null
}

/**
 * The Map section: every project's drawn shapes on one map, filtered by
 * practice type ("all cover crop areas", "only grassed waterways").
 */
export default function AllProjectsMap() {
  const { types, error: typesError } = usePracticeTypes()
  const [allRows, setRows] = useState<Row[] | null>(null)
  const [allLoads, setLoads] = useState<Load[]>([])
  const [huc, setHuc] = useState('') // watershed filter, see matchesHuc
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = everything
  const [showPins, setShowPins] = useState(false)
  const [map, setMap] = useState<L.Map | null>(null)
  const [busy, setBusy] = useState(false)
  const drawnRef = useRef<ExportShape[]>([])

  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name, latitude, longitude, map_shapes, huc10, huc10_name, huc8, huc8_name')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRows((data ?? []) as Row[])
      })
    supabase
      .from('load_model_entries')
      .select('project_id, practice_type, sediment_tons, phosphorus_lb, nitrogen_lb')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setLoads((data ?? []) as Load[])
      })
  }, [])

  // The watershed filter narrows everything below to the projects in it.
  const rows = useMemo(() => (allRows ? allRows.filter((r) => matchesHuc(r, huc)) : null), [allRows, huc])
  const loads = useMemo(() => {
    if (!huc || !rows) return allLoads
    const ids = new Set(rows.map((r) => r.id))
    return allLoads.filter((l) => ids.has(l.project_id))
  }, [allLoads, rows, huc])

  const allItems = useMemo<Item[]>(
    () =>
      (rows ?? []).flatMap((project) =>
        (project.map_shapes?.features ?? []).map((feature) => ({
          project,
          feature,
          practice: (feature.properties?.practice as string | null) ?? null,
          label: (feature.properties?.label as string | null) ?? '',
        })),
      ),
    [rows],
  )

  const known = useMemo(() => new Map(types.map((t) => [t.id, t])), [types])
  const keyOf = (p: string | null) => (p && known.has(p) ? p : NONE)
  const colorOf = useMemo(() => (p: string | null) => (p && known.get(p)?.color) || UNSET_COLOR, [known])
  const nameOf = useMemo(() => (p: string | null) => (p && known.get(p)?.name) || 'No practice set', [known])

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const it of allItems) c.set(keyOf(it.practice), (c.get(keyOf(it.practice)) ?? 0) + 1)
    for (const l of loads) if (!c.has(keyOf(l.practice_type))) c.set(keyOf(l.practice_type), 0)
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, loads, known])

  /** Load reduction per practice type key, and per project. */
  const loadByType = useMemo(() => {
    const m = new Map<string, Load[]>()
    for (const l of loads) m.set(keyOf(l.practice_type), [...(m.get(keyOf(l.practice_type)) ?? []), l])
    return new Map([...m].map(([k, v]) => [k, totalsOf(v)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loads, known])
  const loadOf = useMemo(() => {
    const m = new Map<string, Load[]>()
    for (const l of loads) m.set(l.project_id, [...(m.get(l.project_id) ?? []), l])
    const t = new Map([...m].map(([k, v]) => [k, totalsOf(v)]))
    return (id: string) => t.get(id) ?? null
  }, [loads])
  const shownLoad = useMemo(
    () => totalsOf(selected ? loads.filter((l) => selected.has(keyOf(l.practice_type))) : loads),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loads, selected, known],
  )

  const visible = useMemo(
    () => (selected ? allItems.filter((it) => selected.has(keyOf(it.practice))) : allItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allItems, selected, known],
  )
  const pins = useMemo(
    () => (showPins ? (rows ?? []).filter((r) => r.latitude != null && r.longitude != null) : []),
    [rows, showPins],
  )
  const onLayers = useMemo(() => (l: typeof drawnRef.current) => (drawnRef.current = l), [])

  const choices = [
    ...types.map((t) => ({ key: t.id, name: t.name, color: t.color })),
    { key: NONE, name: 'No practice set', color: UNSET_COLOR },
  ].filter((c) => (counts.get(c.key) ?? 0) > 0 || c.key !== NONE)

  function toggle(key: string) {
    const next = new Set(selected ?? choices.map((c) => c.key))
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next.size === choices.length ? null : next)
  }
  const only = (key: string) => setSelected(new Set([key]))
  const isOn = (key: string) => !selected || selected.has(key)

  async function download() {
    if (!map) return
    setBusy(true)
    try {
      const where = huc ? hucFilterName(huc, allRows ?? []) : 'all projects'
      const caption =
        selected && selected.size === 1
          ? `${choices.find((c) => selected.has(c.key))?.name} · ${where}`
          : huc
            ? `Projects in ${where}`
            : 'All projects'
      // One number per project, counting only what's in the picture, so the
      // key reads 1, 2, 3… with each project's practices beside its name.
      const view = map.getBounds()
      const inView = drawnRef.current
        .filter(({ layer }) =>
          layer instanceof L.Marker
            ? view.contains(layer.getLatLng())
            : layer instanceof L.Polyline && view.intersects(layer.getBounds()),
        )
      const numbers = new Map<string, number>()
      for (const s of inView) if (!numbers.has(s.name)) numbers.set(s.name, numbers.size + 1)
      const numbered = inView.map((s) => ({ ...s, number: numbers.get(s.name)! }))
      const blob = await mapToPng(map, numbered, caption)
      downloadBlob(blob, `twf-map-${caption.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`)
    } catch (e) {
      setError(`Couldn't make the image (${e instanceof Error ? e.message : e}).`)
    }
    setBusy(false)
  }

  return (
    <>
      <div className="page-head">
        <h1>Map</h1>
        <button type="button" onClick={download} disabled={!map || busy}>
          {busy ? 'Making image…' : 'Download PNG'}
        </button>
      </div>
      {(error || typesError) && <p className="error">{error ?? typesError}</p>}

      {loads.length > 0 && (
        <section className="load-banner" aria-label="Load reduction for the practices shown">
          <div className="load-banner-head">
            <strong>Load reduction</strong>
            <span className="muted small">
              {huc && `${hucFilterName(huc, allRows ?? [])} · `}
              {selected === null
                ? 'All practices'
                : selected.size === 0
                  ? 'No practices selected'
                  : choices.filter((c) => selected.has(c.key)).map((c) => c.name).join(', ')}
              {' · '}
              {shownLoad.projects.size} {shownLoad.projects.size === 1 ? 'project' : 'projects'}, {shownLoad.entries}{' '}
              {shownLoad.entries === 1 ? 'calculation' : 'calculations'}
            </span>
          </div>
          <div className="load-banner-values">
            {(
              [
                ['Sediment', shownLoad.sed, 'ton/yr'],
                ['Phosphorus', shownLoad.p, 'lb/yr'],
                ['Nitrogen', shownLoad.n, 'lb/yr'],
              ] as const
            ).map(([label, v, unit]) => (
              <div key={label}>
                <div className="muted small">{label}</div>
                <div className="load-banner-value">{fmt1(v)}</div>
                <div className="muted small">{unit}</div>
              </div>
            ))}
          </div>
          {shownLoad.noSed > 0 && (
            <p className="muted small">
              {shownLoad.noSed} {shownLoad.noSed === 1 ? 'calculation has' : 'calculations have'} no sediment figure in
              the workbook (feedlots), so the sediment total leaves {shownLoad.noSed === 1 ? 'it' : 'them'} out.
            </p>
          )}
        </section>
      )}

      <div className="map-tab">
        <MapContainer
          className="map drawing"
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          ref={setMap}
        >
          <BaseLayers satellite highlight={huc.startsWith('10:') ? huc.slice(3) : null} />
          <Layers items={visible} pins={pins} loadOf={loadOf} colorOf={colorOf} nameOf={nameOf} onLayers={onLayers} />
        </MapContainer>

        <aside className="card shape-list practice-filter">
          {allRows && allRows.length > 0 && (
            <>
              <h2 className="card-title">Watershed</h2>
              <HucFilter rows={allRows} value={huc} onChange={setHuc} />
              {huc && (
                <p className="muted small">
                  {rows?.length ?? 0} of {allRows.length} projects
                </p>
              )}
            </>
          )}
          <h2 className="card-title">Practices</h2>
          {rows === null ? (
            <p className="muted small">Loading…</p>
          ) : allItems.length === 0 ? (
            <p className="muted small">
              No shapes drawn yet. Draw them on a project's Map tab, starting from <Link to="/projects">Projects</Link>.
            </p>
          ) : null}
          <ul>
            {choices.map((c) => (
              <li key={c.key}>
                <label className="check">
                  <input type="checkbox" checked={isOn(c.key)} onChange={() => toggle(c.key)} />
                  <span className="swatch" style={{ background: c.color }} />
                  <span>{c.name}</span>
                  <span className="muted small">{counts.get(c.key) ?? 0}</span>
                </label>
                <button type="button" className="link small" onClick={() => only(c.key)}>
                  only
                </button>
                {loadByType.get(c.key) && <span className="muted practice-load">{short(loadByType.get(c.key)!)}</span>}
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button type="button" onClick={() => setSelected(null)}>Show all</button>
            <button type="button" onClick={() => setSelected(new Set())}>Hide all</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={showPins} onChange={(e) => setShowPins(e.target.checked)} />
            <span>Show project locations</span>
          </label>
          <p className="muted small">
            {visible.length} of {allItems.length} shapes shown. Click a shape for its project.
          </p>
        </aside>
      </div>
    </>
  )
}
