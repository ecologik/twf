import { LayerGroup, LayersControl, TileLayer } from 'react-leaflet'
import { SATELLITE, SATELLITE_LABELS, STREETS } from './leaflet'

/** Streets / Satellite switch in the map's top-right corner. */
export default function BaseLayers({ satellite = false }: { satellite?: boolean }) {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer name="Streets" checked={!satellite}>
        <TileLayer {...STREETS} />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satellite" checked={satellite}>
        <LayerGroup>
          <TileLayer {...SATELLITE} />
          <TileLayer {...SATELLITE_LABELS} />
        </LayerGroup>
      </LayersControl.BaseLayer>
    </LayersControl>
  )
}
