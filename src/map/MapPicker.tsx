import { useEffect, useMemo, useRef } from 'react'
import type { LeafletEventHandlerFnMap, Marker as LeafletMarker } from 'leaflet'
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import BaseLayers from './BaseLayers'
import { DEFAULT_CENTER, DEFAULT_ZOOM } from './leaflet'

export type LatLng = { lat: number; lng: number }

/** Rounds to 6 decimals (about 10 cm), plenty for a project site. */
const round = (n: number) => Math.round(n * 1e6) / 1e6

function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) })
    },
  })
  return null
}

/** Pans to the pin when it is set from outside the map (typed coordinates). */
function FollowPin({ value }: { value: LatLng | null }) {
  const map = useMap()
  useEffect(() => {
    if (value && !map.getBounds().contains([value.lat, value.lng])) {
      map.panTo([value.lat, value.lng])
    }
  }, [map, value])
  return null
}

/**
 * Click the map to drop a pin; drag the pin to fine-tune it.
 * Opens on satellite imagery, since creeks and fields are easier to find there.
 */
export default function MapPicker({ value, onChange }: { value: LatLng | null; onChange: (p: LatLng) => void }) {
  const markerRef = useRef<LeafletMarker>(null)
  const handlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      dragend() {
        const m = markerRef.current
        if (m) {
          const p = m.getLatLng()
          onChange({ lat: round(p.lat), lng: round(p.lng) })
        }
      },
    }),
    [onChange],
  )

  return (
    <MapContainer
      className="map picker"
      center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
      zoom={value ? 15 : DEFAULT_ZOOM}
      scrollWheelZoom
    >
      <BaseLayers satellite />
      <ClickToPlace onPick={onChange} />
      <FollowPin value={value} />
      {value && <Marker position={[value.lat, value.lng]} draggable eventHandlers={handlers} ref={markerRef} />}
    </MapContainer>
  )
}
