import { useEffect, useState } from 'react'
import L from 'leaflet'
import { LayerGroup, useMap } from 'react-leaflet'
import { HUC10_LAYER, HUC8_LAYER, HUC_PANE, hucShapes } from './huc'

const COLOR = '#0b4f8a'
const CREDIT = 'Watersheds: <a href="https://www.usgs.gov/national-hydrography/watershed-boundary-dataset">USGS WBD</a>'

/** Below this zoom HUC-8 subbasins are drawn instead of HUC-10 watersheds. */
const HUC10_MIN_ZOOM = 9
const HUC8_MIN_ZOOM = 6
const LABEL_MIN_ZOOM = 10

/**
 * Fills a layer group with faint HUC watershed outlines for the current view,
 * re-fetching (from USGS) after each pan or zoom while the group is on the map.
 */
function Fetcher({ group, highlight }: { group: L.LayerGroup; highlight?: string | null }) {
  const map = useMap()

  useEffect(() => {
    if (!map.getPane(HUC_PANE)) {
      // Above the tiles, under drawn shapes and pins, and never in the way of a click.
      const pane = map.createPane(HUC_PANE)
      pane.style.zIndex = '350'
      pane.style.pointerEvents = 'none'
    }

    let abort: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const load = async () => {
      abort?.abort()
      if (!map.hasLayer(group)) return
      const zoom = map.getZoom()
      if (zoom < HUC8_MIN_ZOOM) {
        group.clearLayers()
        return
      }
      const layer = zoom >= HUC10_MIN_ZOOM ? HUC10_LAYER : HUC8_LAYER
      const view = map.getBounds()
      // About one screen pixel, in degrees: finer detail wouldn't show.
      const tolerance = (view.getEast() - view.getWest()) / map.getSize().x
      const b = view.pad(0.2)
      abort = new AbortController()
      try {
        const fc = await hucShapes(
          layer,
          { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
          tolerance,
          abort.signal,
        )
        group.clearLayers()
        L.geoJSON(fc, {
          pane: HUC_PANE,
          interactive: false,
          style: (f) => {
            const mine = !!highlight && layer === HUC10_LAYER && f?.properties?.huc10 === highlight
            return {
              pane: HUC_PANE,
              interactive: false,
              color: COLOR,
              weight: layer === HUC8_LAYER ? 2 : mine ? 2.2 : 1.2,
              opacity: mine ? 0.7 : 0.45,
              fillColor: COLOR,
              fillOpacity: layer === HUC8_LAYER ? 0.02 : mine ? 0.1 : 0.03,
              dashArray: layer === HUC8_LAYER ? '6 4' : undefined,
            }
          },
          onEachFeature: (f, l) => {
            if (layer === HUC10_LAYER && zoom >= LABEL_MIN_ZOOM && f.properties?.name) {
              l.bindTooltip(String(f.properties.name), {
                permanent: true,
                direction: 'center',
                className: 'huc-label',
                interactive: false,
              })
            }
          },
        }).eachLayer((l) => group.addLayer(l))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.warn('Watershed outlines:', e)
      }
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(load, 250)
    }
    const onAdd = () => {
      map.attributionControl?.addAttribution(CREDIT)
      schedule()
    }
    const onRemove = () => {
      abort?.abort()
      map.attributionControl?.removeAttribution(CREDIT)
    }

    map.on('moveend', schedule)
    group.on('add', onAdd)
    group.on('remove', onRemove)
    if (map.hasLayer(group)) onAdd()
    return () => {
      clearTimeout(timer)
      abort?.abort()
      map.off('moveend', schedule)
      group.off('add', onAdd)
      group.off('remove', onRemove)
      group.clearLayers()
      map.attributionControl?.removeAttribution(CREDIT)
    }
  }, [map, group, highlight])

  return null
}

/** Goes inside a LayersControl.Overlay (see BaseLayers). */
export default function HucLayer({ highlight }: { highlight?: string | null }) {
  const [group, setGroup] = useState<L.LayerGroup | null>(null)
  return (
    <>
      <LayerGroup ref={setGroup} />
      {group && <Fetcher group={group} highlight={highlight} />}
    </>
  )
}
