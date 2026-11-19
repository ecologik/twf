import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

// Leaflet's default pin looks for its images by a path Vite doesn't serve, so
// every marker uses the bundled copies instead.
L.Marker.prototype.options.icon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  // Half Leaflet's default size, so nearby projects don't hide each other.
  iconSize: [13, 21],
  iconAnchor: [6, 21],
  popupAnchor: [1, -18],
  tooltipAnchor: [8, -14],
  shadowSize: [21, 21],
  shadowAnchor: [6, 21],
})

/** Where a new map opens: TWF's lakes in Kosciusko County, Indiana. */
export const DEFAULT_CENTER: [number, number] = [41.32, -85.78]
export const DEFAULT_ZOOM = 11

export const STREETS = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}

export const SATELLITE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics and the GIS User Community',
  maxZoom: 19,
}

/** Road and place names drawn on top of the satellite imagery. */
export const SATELLITE_LABELS = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  attribution: '',
  maxZoom: 19,
}
