import type { Feature, Position } from 'geojson'

/**
 * Sizes of drawn map shapes, on the sphere (no map library needed).
 * Good to well under 1% at field and watershed scale.
 */
const R = 6378137 // metres, same radius Leaflet uses
const rad = (d: number) => (d * Math.PI) / 180

export const SQ_M_PER_ACRE = 4046.8564224
export const M_PER_FT = 0.3048
export const FT_PER_MILE = 5280

/** Area of one ring in square metres (spherical excess formula Leaflet.draw uses). */
function ringArea(ring: Position[]): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    a += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)))
  }
  return Math.abs((a * R * R) / 2)
}

/** Outer ring minus holes. */
function polygonArea(rings: Position[][]): number {
  return rings.reduce((sum, ring, i) => sum + (i === 0 ? 1 : -1) * ringArea(ring), 0)
}

/** Great-circle length of a line in metres. */
function lineLength(line: Position[]): number {
  let m = 0
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, y1] = line[i]
    const [x2, y2] = line[i + 1]
    const h =
      Math.sin(rad(y2 - y1) / 2) ** 2 + Math.cos(rad(y1)) * Math.cos(rad(y2)) * Math.sin(rad(x2 - x1) / 2) ** 2
    m += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
  }
  return m
}

export type ShapeSize = { kind: 'area' | 'line' | 'point' | null; sqm: number; m: number }

/** A drawn shape's kind and size: area in m² for polygons, length in m for lines. */
export function shapeSize(f: Feature): ShapeSize {
  const g = f.geometry
  if (!g) return { kind: null, sqm: 0, m: 0 }
  switch (g.type) {
    case 'Polygon':
      return { kind: 'area', sqm: polygonArea(g.coordinates), m: 0 }
    case 'MultiPolygon':
      return { kind: 'area', sqm: g.coordinates.reduce((s, p) => s + polygonArea(p), 0), m: 0 }
    case 'LineString':
      return { kind: 'line', sqm: 0, m: lineLength(g.coordinates) }
    case 'MultiLineString':
      return { kind: 'line', sqm: 0, m: g.coordinates.reduce((s, l) => s + lineLength(l), 0) }
    case 'Point':
    case 'MultiPoint':
      return { kind: 'point', sqm: 0, m: 0 }
    default:
      return { kind: null, sqm: 0, m: 0 }
  }
}
