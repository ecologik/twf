import type { FeatureCollection } from 'geojson'
import type { HucFields } from '../../map/huc'

export type Project = HucFields & {
  id: string
  name: string
  location: string | null
  description: string | null
  latitude: number | null
  longitude: number | null
  /** Shapes from the Map tab, as GeoJSON. */
  map_shapes: FeatureCollection | null
  /** Google Drive folder for the project's files. */
  drive_folder_id: string | null
  created_at: string
  updated_at: string
}

export const PROJECT_COLUMNS = 'id, name, location, description, latitude, longitude, map_shapes, drive_folder_id, huc10, huc10_name, huc8, huc8_name, created_at, updated_at'
