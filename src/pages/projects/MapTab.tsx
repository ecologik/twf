import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import type { Feature, FeatureCollection } from 'geojson'
import { Link } from 'react-router-dom'
import { MapContainer, useMap } from 'react-leaflet'
import { supabase } from '../../lib/supabase'
import { UNSET_COLOR, usePracticeTypes } from '../../lib/practices'
import BaseLayers from '../../map/BaseLayers'
import { downloadBlob, mapToPng } from '../../map/exportPng'
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../map/leaflet'
import { colorPin, styleFor } from '../../map/pins'

type Kind = 'area' | 'line' | 'point'
type Shape = { id: number; kind: Kind; label: string; practice: string | null }

const KIND_LABEL: Record<Kind, string> = { area: 'Area', line: 'Line', point: 'Point' }

function kindOf(layer: L.Layer): Kind | null {
  if (layer instanceof L.Marker) return 'point'
  if (layer instanceof L.Polygon) return 'area'
  if (layer instanceof L.Polyline) return 'line'
  return null
}

function showLabel(layer: L.Layer, label: string) {
  layer.unbindTooltip()
  if (!label.trim()) return
  layer.bindTooltip(label, {
    permanent: true,
    direction: layer instanceof L.Marker ? 'right' : 'center',
    className: 'shape-label',
    offset: layer instanceof L.Marker ? [4, -4] : [0, 0],
  })
}

/**
 * Sets up Geoman's drawing toolbar. Tells the tab when shapes are added
 * (drawn, or loaded from the saved GeoJSON) or erased; the tab owns their
 * labels, practices and styling.
 */
function DrawTools({
  initial,
  layers,
  onAdd,
  onRemove,
  onDirty,
  onMap,
  onClear,
}: {
  initial: FeatureCollection | null
  layers: React.RefObject<Map<number, L.Layer>>
  onAdd: (s: Shape, drawn: boolean) => void
  onRemove: (id: number) => void
  onDirty: () => void
  onMap: (m: L.Map) => void
  onClear: () => void
}) {
  const map = useMap()

  useEffect(() => {
    onMap(map)
    const registry = layers.current

    const register = (layer: L.Layer, label: string, practice: string | null, drawn: boolean) => {
      const kind = kindOf(layer)
      if (!kind) return
      const id = L.stamp(layer)
      registry.set(id, layer)
      layer.on('pm:edit pm:dragend', onDirty)
      onAdd({ id, kind, label, practice }, drawn)
    }

    // Shapes saved earlier.
    if (initial?.features.length) {
      const bounds = L.latLngBounds([])
      L.geoJSON(initial, {
        pointToLayer: (_f, ll) => L.marker(ll, { icon: colorPin(UNSET_COLOR) }),
        onEachFeature: (f, layer) => {
          map.addLayer(layer)
          if (layer instanceof L.Marker) bounds.extend(layer.getLatLng())
          else if (layer instanceof L.Polyline) bounds.extend(layer.getBounds())
          const props = f.properties ?? {}
          register(layer, String(props.label ?? ''), props.practice ? String(props.practice) : null, false)
        },
      })
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.3), { maxZoom: 17 })
    }

    map.pm.setGlobalOptions({
      markerStyle: { icon: colorPin(UNSET_COLOR) },
      pathOptions: { color: UNSET_COLOR, fillColor: UNSET_COLOR, fillOpacity: 0.25, weight: 3 },
    })
    map.pm.addControls({
      position: 'topleft',
      drawMarker: true,
      drawPolyline: true,
      drawPolygon: true,
      drawRectangle: true,
      drawCircle: false,
      drawCircleMarker: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
      editMode: true,
      dragMode: true,
      removalMode: true,
    })

    const handleCreate = (e: { layer: L.Layer }) => {
      register(e.layer, '', null, true)
      onDirty()
    }
    const handleRemove = (e: { layer: L.Layer }) => {
      const id = L.stamp(e.layer)
      if (!registry.delete(id)) return
      onRemove(id)
      onDirty()
    }
    map.on('pm:create', handleCreate)
    map.on('pm:remove', handleRemove)

    return () => {
      map.off('pm:create', handleCreate)
      map.off('pm:remove', handleRemove)
      map.pm.removeControls()
      registry.forEach((l) => map.removeLayer(l))
      registry.clear()
      onClear()
    }
    // Set up once per map; `initial` is only read on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  return null
}

/**
 * The project's Map tab: draw areas, lines and points, tag each with a
 * practice type and a label, save them with the project, and download the
 * view as a PNG.
 */
export default function MapTab({
  projectId,
  projectName,
  center,
  initial,
  onSaved,
}: {
  projectId: string
  projectName: string
  center: [number, number] | null
  initial: FeatureCollection | null
  onSaved: (fc: FeatureCollection | null) => void
}) {
  const layers = useRef(new Map<number, L.Layer>())
  const { types, error: typesError } = usePracticeTypes()
  const [map, setMap] = useState<L.Map | null>(null)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'save' | 'png' | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  // New shapes start with the practice picked most recently, since staff
  // usually draw several of the same kind in a row.
  const lastPractice = useRef<string | null>(null)

  const colorOf = useMemo(() => {
    const byId = new Map(types.map((t) => [t.id, t.color]))
    return (practice: string | null) => (practice && byId.get(practice)) || UNSET_COLOR
  }, [types])

  const markDirty = useCallback(() => setDirty(true), [])
  const onAdd = useCallback((s: Shape, drawn: boolean) => {
    const shape = drawn ? { ...s, practice: lastPractice.current } : s
    setShapes((prev) => [...prev.filter((x) => x.id !== s.id), shape])
  }, [])
  const onRemove = useCallback((id: number) => setShapes((prev) => prev.filter((x) => x.id !== id)), [])
  const onClear = useCallback(() => setShapes([]), [])

  // Keep each shape's colour and label on the map in step with the list.
  useEffect(() => {
    for (const s of shapes) {
      const layer = layers.current.get(s.id)
      if (!layer) continue
      styleFor(layer, colorOf(s.practice))
      showLabel(layer, s.label)
    }
  }, [shapes, colorOf])

  function update(id: number, patch: Partial<Shape>) {
    if (patch.practice !== undefined) lastPractice.current = patch.practice
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    setDirty(true)
  }

  function remove(id: number) {
    const layer = layers.current.get(id)
    if (map && layer) {
      map.removeLayer(layer)
      map.fire('pm:remove', { layer })
    }
  }

  function zoomTo(id: number) {
    const layer = layers.current.get(id)
    if (!map || !layer) return
    if (layer instanceof L.Marker) map.setView(layer.getLatLng(), Math.max(map.getZoom(), 16))
    else if (layer instanceof L.Polyline) map.fitBounds(layer.getBounds().pad(0.4), { maxZoom: 18 })
  }

  function collect(): FeatureCollection | null {
    const features: Feature[] = shapes.map((s) => {
      const layer = layers.current.get(s.id) as L.Marker | L.Polyline
      const f = layer.toGeoJSON() as Feature
      return { ...f, properties: { label: s.label.trim() || null, practice: s.practice } }
    })
    return features.length ? { type: 'FeatureCollection', features } : null
  }

  async function save() {
    setBusy('save')
    setMessage(null)
    const fc = collect()
    const { error } = await supabase.from('projects').update({ map_shapes: fc }).eq('id', projectId)
    setBusy(null)
    if (error) setMessage({ text: error.message, error: true })
    else {
      setDirty(false)
      onSaved(fc)
      setMessage({ text: 'Shapes saved.' })
    }
  }

  async function download() {
    if (!map) return
    setBusy('png')
    setMessage(null)
    try {
      const exportShapes = shapes.map((s) => ({
        layer: layers.current.get(s.id)!,
        label: s.label.trim(),
        color: colorOf(s.practice),
      }))
      const used = new Set(shapes.map((s) => s.practice))
      const legend = types.filter((t) => used.has(t.id)).map((t) => ({ name: t.name, color: t.color }))
      const blob = await mapToPng(map, exportShapes, projectName, legend)
      const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
      downloadBlob(blob, `${slug}-map.png`)
    } catch (e) {
      setMessage({
        text: `Couldn't make the image (${e instanceof Error ? e.message : e}). Try switching between Satellite and Streets.`,
        error: true,
      })
    }
    setBusy(null)
  }

  return (
    <div className="map-tab">
      <div>
        <MapContainer
          className="map drawing"
          center={center ?? DEFAULT_CENTER}
          zoom={center ? 16 : DEFAULT_ZOOM}
          scrollWheelZoom
        >
          <BaseLayers satellite />
          <DrawTools
            initial={initial}
            layers={layers}
            onAdd={onAdd}
            onRemove={onRemove}
            onDirty={markDirty}
            onMap={setMap}
            onClear={onClear}
          />
        </MapContainer>
        <p className="muted small">
          Use the tools on the left to draw an area, a line or a point, then pick its practice in the list. Edit, move
          and erase are below the drawing tools. The PNG shows exactly what the map shows, so zoom and pan to frame it
          first.
        </p>
      </div>

      <aside className="card shape-list">
        <h2 className="card-title">Shapes</h2>
        {typesError && <p className="error small">Couldn't load practice types: {typesError}</p>}
        {shapes.length === 0 ? (
          <p className="muted small">Nothing drawn yet.</p>
        ) : (
          <ul>
            {shapes.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="shape-kind"
                  style={{ borderColor: colorOf(s.practice), color: colorOf(s.practice) }}
                  onClick={() => zoomTo(s.id)}
                  title="Zoom to it"
                >
                  {KIND_LABEL[s.kind]}
                </button>
                <select
                  value={s.practice ?? ''}
                  onChange={(e) => update(s.id, { practice: e.target.value || null })}
                  aria-label={`${KIND_LABEL[s.kind]} practice`}
                >
                  <option value="">Practice…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  {s.practice && !types.some((t) => t.id === s.practice) && (
                    <option value={s.practice}>Unknown ({s.practice})</option>
                  )}
                </select>
                <button type="button" className="icon-button small-x" onClick={() => remove(s.id)} aria-label="Remove">
                  ×
                </button>
                <input
                  className="shape-label-input"
                  value={s.label}
                  onChange={(e) => update(s.id, { label: e.target.value })}
                  placeholder="Label (optional)"
                  aria-label={`${KIND_LABEL[s.kind]} label`}
                />
              </li>
            ))}
          </ul>
        )}
        {message && <p className={message.error ? 'error small' : 'notice small'}>{message.text}</p>}
        <div className="form-actions">
          <button type="button" className="primary" onClick={save} disabled={!dirty || busy !== null}>
            {busy === 'save' ? 'Saving…' : 'Save shapes'}
          </button>
          <button type="button" onClick={download} disabled={!map || busy !== null}>
            {busy === 'png' ? 'Making image…' : 'Download PNG'}
          </button>
        </div>
        {dirty && <p className="muted small">Unsaved changes.</p>}
        <p className="muted small">
          Missing a practice? Admins can add one in <Link to="/admin/practices">Practice types</Link>.
        </p>
      </aside>
    </div>
  )
}
