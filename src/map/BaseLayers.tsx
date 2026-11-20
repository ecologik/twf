import { LayerGroup, LayersControl, TileLayer } from 'react-leaflet'
import HucLayer from './HucLayer'
import { SATELLITE, SATELLITE_LABELS, STREETS } from './leaflet'

/**
 * Streets / Satellite switch in the map's top-right corner, plus the faint
 * HUC watershed outlines (on unless `watersheds` is false). `highlight` is a
 * HUC-10 code to draw a little stronger, such as the project's own.
 */
export default function BaseLayers({
  satellite = false,
  watersheds = true,
  highlight,
}: {
  satellite?: boolean
  watersheds?: boolean
  highlight?: string | null
}) {
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
      <LayersControl.Overlay name="Watersheds (HUC-10)" checked={watersheds}>
        <HucLayer highlight={highlight} />
      </LayersControl.Overlay>
    </LayersControl>
  )
}
