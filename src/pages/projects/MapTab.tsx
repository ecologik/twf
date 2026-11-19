import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import type { Feature, FeatureCollection } from 'geojson'
import { MapContainer, useMap } from 'react-leaflet'
import { supabase } from '../../lib/supabase'
import BaseLayers from '../../map/BaseLayers'
import { downloadBlob, mapToPng } from '../../map/exportPng'
import { DEFAULT_CENTER, DEFAULT_ZOOM, PIN_ICON } from '../../map/leaflet'

type Kind = 'area' | 'line' | 'point'
type Shape = { id: number; kind: Kind; label: string }

const KIND_LABEL: Record<Kind, string> = { area: 'Area', line: 'Line', point: 'Point' }

// Bright colours that stand out on satellite imagery.
const AREA_STYLE: L.PathOptions = { color: '#f6c445', weight: 3, fillColor: '#f6c445', fillOpacity: 0.22 }
const LINE_STYLE: L.PathOptions = { color: '#4fc3f7', weight: 4 }

function kindOf(layer: L.Layer): Kind | null {
  if (layer instanceof L.Marker) return 'point'
  if (layer instanceof L.Polygon) return 'area'
  if (layer instanceof L.Polyline) return 'line'
  return null
}

function styleLayer(layer: L.Layer) {
  if (layer instanceof L.Polygon) layer.setStyle(AREA_STYLE)
  else if (layer instanceof L.Polyline) layer.setStyle(LINE_STYLE)
}

function showLabel(layer: L.Layer, label: string) {
  layer.unbindTooltip()
  if (!label.trim()) return
  layer.bindTooltip(label, {
    permanent: true,
    direction: layer instanceof L.Marker ? 'right' : 'center',
    className: 'shape-label',
    offset: layer instanceof L.Marker ? [4, -12] : [0, 0],
  })
}

/** Sets up Geoman's drawing toolbar and reports shapes as they change. */
function DrawTools({
  initial,
  layers,
  onShapes,
  onDirty,
  onMap,
}: {
  initial: FeatureCollection | null
  layers: React.RefObject<Map<number, L.Layer>>
  onShapes: (s: Shape[]) => void
  onDirty: () => void
  onMap: (m: L.Map) => void
}) {
  const map = useMap()

  useEffect(() => {
    onMap(map)
    const registry = layers.current
    const labels = new Map<number, string>()
    const publish = () =>
      onShapes([...registry].map(([id, l]) => ({ id, kind: kindOf(l)!, label: labels.get(id) ?? '' })))

    const register = (layer: L.Layer, label = '') => {
      const kind = kindOf(layer)
      if (!kind) return
      styleLayer(layer)
      const id = L.stamp(layer)
      registry.set(id, layer)
      labels.set(id, label)
      showLabel(layer, label)
      layer.on('pm:edit pm:dragend', onDirty)
    }

    // Shapes saved earlier.
    const loaded: L.Layer[] = []
    if (initial?.features.length) {
      L.geoJSON(initial, {
        pointToLayer: (_f, ll) => L.marker(ll, { icon: PIN_ICON }),
        onEachFeature: (f, layer) => {
          map.addLayer(layer)
          loaded.push(layer)
          register(layer, String(f.properties?.label ?? ''))
        },
      })
      const bounds = L.latLngBounds([])
      loaded.forEach((l) => {
        if (l instanceof L.Marker) bounds.extend(l.getLatLng())
        else if (l instanceof L.Polyline) bounds.extend(l.getBounds())
      })
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.3), { maxZoom: 17 })
    }
    publish()

    map.pm.setGlobalOptions({ markerStyle: { icon: PIN_ICON }, pathOptions: AREA_STYLE })
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

    const onCreate = (e: { layer: L.Layer }) => {
      register(e.layer)
      publish()
      onDirty()
    }
    const onRemove = (e: { layer: L.Layer }) => {
      const id = L.stamp(e.layer)
      if (!registry.delete(id)) return
      labels.delete(id)
      publish()
      onDirty()
    }
    // Labels are edited in the list beside the map, which calls this.
    const onLabel = (e: { id: number; label: string }) => {
      const layer = registry.get(e.id)
      if (!layer) return
      labels.set(e.id, e.label)
      showLabel(layer, e.label)
      publish()
    }
    map.on('pm:create', onCreate)
    map.on('pm:remove', onRemove)
    map.on('twf:label', onLabel as unknown as L.LeafletEventHandlerFn)

    return () => {
      map.off('pm:create', onCreate)
      map.off('pm:remove', onRemove)
      map.off('twf:label', onLabel as unknown as L.LeafletEventHandlerFn)
      map.pm.removeControls()
      registry.forEach((l) => map.removeLayer(l))
      registry.clear()
    }
    // Set up once per map; `initial` is only read on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  return null
}

/**
 * The project's Map tab: draw areas, lines and points, label them, save them
 * with the project, and download the view as a PNG.
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
  const [map, setMap] = useState<L.Map | null>(null)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'save' | 'png' | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const markDirty = useCallback(() => setDirty(true), [])

  function setLabel(id: number, label: string) {
    map?.fire('twf:label', { id, label })
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
      return { ...f, properties: { label: s.label.trim() || null } }
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
      const labelled = shapes.map((s) => ({ layer: layers.current.get(s.id)!, label: s.label.trim() }))
      const blob = await mapToPng(map, labelled, projectName)
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
          <DrawTools initial={initial} layers={layers} onShapes={setShapes} onDirty={markDirty} onMap={setMap} />
        </MapContainer>
        <p className="muted small">
          Use the tools on the left to draw an area, a line or a point. Edit, move and erase are below them. Whatever the
          map shows is what goes into the PNG, so zoom and pan to frame it first.
        </p>
      </div>

      <aside className="card shape-list">
        <h2 className="card-title">Shapes</h2>
        {shapes.length === 0 ? (
          <p className="muted small">Nothing drawn yet.</p>
        ) : (
          <ul>
            {shapes.map((s) => (
              <li key={s.id}>
                <button type="button" className={`shape-kind ${s.kind}`} onClick={() => zoomTo(s.id)} title="Zoom to it">
                  {KIND_LABEL[s.kind]}
                </button>
                <input
                  value={s.label}
                  onChange={(e) => setLabel(s.id, e.target.value)}
                  placeholder="Label (optional)"
                  aria-label={`${KIND_LABEL[s.kind]} label`}
                />
                <button type="button" className="icon-button small-x" onClick={() => remove(s.id)} aria-label="Remove">
                  ×
                </button>
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
      </aside>
    </div>
  )
}
