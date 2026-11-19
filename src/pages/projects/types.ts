export type Project = {
  id: string
  name: string
  location: string | null
  description: string | null
  latitude: number | null
  longitude: number | null
  created_at: string
  updated_at: string
}

export const PROJECT_COLUMNS = 'id, name, location, description, latitude, longitude, created_at, updated_at'
