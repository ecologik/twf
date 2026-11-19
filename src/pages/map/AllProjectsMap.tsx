import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import type { Feature, FeatureCollection } from 'geojson'
import { MapContainer, useMap } from 'react-leaflet'
import { supabase } from '../../lib/supabase'
import { UNSET_COLOR, usePracticeTypes } from '../../lib/practices'
import BaseLayers from '../../map/BaseLayers'
import { downloadBlob, mapToPng } from '../../map/exportPng'
import { DEFAULT_CENTER, DEFAULT_ZOOM, PIN_ICON } from '../../map/leaflet'
import { colorPin, styleFor } from '../../map/pins'

type Row = { id: string; name: string; latitude: number | null; longitude: number | null; map_shapes: FeatureCollection | null }
type Item = { project: Row; feature: Feature; practice: string | null; label: string }

const NONE = '__none__'

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Draws the filtered shapes (and optionally project pins) and fits the view. */
function Layers({
  items,
  pins,
  colorOf,
  nameOf,
  onLayers,
}: {
  items: Item[]
  pins: Row[]
  colorOf: (p: string | null) => string
  nameOf: (p: string | null) => string
  onLayers: (l: { layer: L.Layer; color: string; label: string }[]) => void
}) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    const group = L.featureGroup().addTo(map)
    const drawn: { layer: L.Layer; color: string; label: string }[] = []

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
          drawn.push({ layer, color, label: '' })
        },
      })
    }
    for (const p of pins) {
      const m = L.marker([p.latitude!, p.longitude!], { icon: PIN_ICON })
      m.bindPopup(`<strong>${escapeHtml(p.name)}</strong><div><a href="/projects/${p.id}">Open project</a></div>`)
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
  }, [map, items, pins, colorOf, nameOf, onLayers])

  return null
}

/**
 * The Map section: every project's drawn shapes on one map, filtered by
 * practice type ("all cover crop areas", "only grassed waterways").
 */
export default function AllProjectsMap() {
  const { types, error: typesError } = usePracticeTypes()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = everything
  const [showPins, setShowPins] = useState(false)
  const [map, setMap] = useState<L.Map | null>(null)
  const [busy, setBusy] = useState(false)
  const drawnRef = useRef<{ layer: L.Layer; color: string; label: string }[]>([])

  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name, latitude, longitude, map_shapes')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRows((data ?? []) as Row[])
      })
  }, [])

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
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, known])

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
      const shown = new Set(visible.map((it) => keyOf(it.practice)))
      const legend = choices.filter((c) => shown.has(c.key)).map((c) => ({ name: c.name, color: c.color }))
      const caption =
        selected && selected.size === 1 ? `${choices.find((c) => selected.has(c.key))?.name} · all projects` : 'All projects'
      const blob = await mapToPng(map, drawnRef.current, caption, legend)
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

      <div className="map-tab">
        <MapContainer
          className="map drawing"
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          ref={setMap}
        >
          <BaseLayers satellite />
          <Layers items={visible} pins={pins} colorOf={colorOf} nameOf={nameOf} onLayers={onLayers} />
        </MapContainer>

        <aside className="card shape-list practice-filter">
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
