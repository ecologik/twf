import type { FeatureCollection } from 'geojson'

export type Project = {
  id: string
  name: string
  location: string | null
  description: string | null
  latitude: number | null
  longitude: number | null
  /** Shapes from the Map tab, as GeoJSON. */
  map_shapes: FeatureCollection | null
  created_at: string
  updated_at: string
}

export const PROJECT_COLUMNS = 'id, name, location, description, latitude, longitude, map_shapes, created_at, updated_at'
