import type { FeatureCollection } from 'geojson'

/**
 * HUC watersheds from the USGS Watershed Boundary Dataset. Public ArcGIS
 * service, no key. Layer 4 is HUC-8 (subbasin), 5 is HUC-10 (watershed).
 */
const WBD = 'https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer'
export const HUC8_LAYER = 4
export const HUC10_LAYER = 5

/** Leaflet pane the outlines are drawn in (exportPng looks for it). */
export const HUC_PANE = 'huc'

export type HucInfo = {
  huc10: string
  huc10_name: string | null
  huc8_name: string | null
}

/** What a project row carries (huc8 is generated from huc10 in the database). */
export type HucFields = {
  huc10: string | null
  huc10_name: string | null
  huc8: string | null
  huc8_name: string | null
}

async function query(layer: number, params: Record<string, string>, signal?: AbortSignal) {
  const url = `${WBD}/${layer}/query?${new URLSearchParams(params)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`USGS watershed service answered ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(json.error.message ?? 'USGS watershed service error')
  return json
}

/**
 * The HUC-10 (and its HUC-8) containing a point, or null if the point is
 * outside the dataset (e.g. outside the US). Throws if the service can't be
 * reached.
 */
export async function lookupHuc(lat: number, lng: number, signal?: AbortSignal): Promise<HucInfo | null> {
  const at = {
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    returnGeometry: 'false',
    f: 'json',
  }
  const [h10, h8] = await Promise.all([
    query(HUC10_LAYER, { ...at, outFields: 'huc10,name' }, signal),
    query(HUC8_LAYER, { ...at, outFields: 'huc8,name' }, signal),
  ])
  const a10 = h10.features?.[0]?.attributes
  if (!a10?.huc10) return null
  const a8 = h8.features?.[0]?.attributes
  return { huc10: String(a10.huc10), huc10_name: a10.name ?? null, huc8_name: a8?.name ?? null }
}

/**
 * Watershed outlines in a lat/long box, simplified to about one screen pixel
 * (`tolerance`, in degrees) so a wide view stays light.
 */
export async function hucShapes(
  layer: number,
  box: { west: number; south: number; east: number; north: number },
  tolerance: number,
  signal?: AbortSignal,
): Promise<FeatureCollection> {
  const code = layer === HUC8_LAYER ? 'huc8' : 'huc10'
  return query(
    layer,
    {
      geometry: `${box.west},${box.south},${box.east},${box.north}`,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: `${code},name`,
      returnGeometry: 'true',
      maxAllowableOffset: String(tolerance),
      geometryPrecision: '5',
      f: 'geojson',
    },
    signal,
  ) as Promise<FeatureCollection>
}

/** "Tippecanoe Lake (0512010601)" */
export function hucLabel(name: string | null, code: string | null): string {
  if (!code) return 'No watershed yet'
  return name ? `${name} (${code})` : code
}

/**
 * Watershed filter values: '' for everything, 'none' for projects without a
 * watershed, '8:<code>' for a whole HUC-8, '10:<code>' for one HUC-10.
 */
export type HucFilterValue = string

export function matchesHuc(p: HucFields, value: HucFilterValue): boolean {
  if (!value) return true
  if (value === 'none') return !p.huc10
  if (value.startsWith('8:')) return p.huc8 === value.slice(2)
  if (value.startsWith('10:')) return p.huc10 === value.slice(3)
  return true
}

export type HucGroup = {
  huc8: string
  name: string | null
  count: number
  watersheds: { huc10: string; name: string | null; count: number }[]
}

/** The watersheds that projects fall in, grouped by HUC-8, for a filter list. */
export function hucGroups(rows: HucFields[]): { groups: HucGroup[]; missing: number } {
  const groups = new Map<string, HucGroup>()
  let missing = 0
  for (const r of rows) {
    if (!r.huc10) {
      missing++
      continue
    }
    const h8 = r.huc8 ?? r.huc10.slice(0, 8)
    let g = groups.get(h8)
    if (!g) groups.set(h8, (g = { huc8: h8, name: r.huc8_name, count: 0, watersheds: [] }))
    g.count++
    g.name ??= r.huc8_name
    let w = g.watersheds.find((x) => x.huc10 === r.huc10)
    if (!w) g.watersheds.push((w = { huc10: r.huc10, name: r.huc10_name, count: 0 }))
    w.count++
  }
  const byName = (a: { name: string | null }, b: { name: string | null }) => (a.name ?? '').localeCompare(b.name ?? '')
  const list = [...groups.values()].sort(byName)
  for (const g of list) g.watersheds.sort(byName)
  return { groups: list, missing }
}

/** Describes a filter value in words, for captions. */
export function hucFilterName(value: HucFilterValue, rows: HucFields[]): string {
  if (!value) return ''
  if (value === 'none') return 'No watershed set'
  const code = value.slice(value.indexOf(':') + 1)
  const r = rows.find((x) => (value.startsWith('8:') ? x.huc8 === code : x.huc10 === code))
  const name = value.startsWith('8:') ? r?.huc8_name : r?.huc10_name
  return `${name ?? code} (HUC-${value.startsWith('8:') ? 8 : 10} ${code})`
}
