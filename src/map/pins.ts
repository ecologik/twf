import L from 'leaflet'

const PIN_PATH = 'M9 0C4 0 0 4 0 9c0 6.8 9 17 9 17s9-10.2 9-17c0-5-4-9-9-9z'

/** An 18x26 map pin in any colour, for points tagged with a practice. */
export function colorPin(color: string): L.DivIcon {
  return L.divIcon({
    className: 'color-pin',
    html: `<svg width="18" height="26" viewBox="0 0 18 26"><path d="${PIN_PATH}" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="9" cy="9" r="3.2" fill="#fff"/></svg>`,
    iconSize: [18, 26],
    iconAnchor: [9, 26],
    popupAnchor: [0, -24],
    tooltipAnchor: [9, -16],
  })
}

/** Draws the same pin on a canvas with its tip at (x, y). */
export function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.translate(x - 9, y - 26)
  const p = new Path2D(PIN_PATH)
  ctx.fillStyle = color
  ctx.fill(p)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#fff'
  ctx.stroke(p)
  ctx.beginPath()
  ctx.arc(9, 9, 3.2, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.restore()
}

/** Map styles for a shape in a given practice colour. */
export function styleFor(layer: L.Layer, color: string) {
  if (layer instanceof L.Marker) layer.setIcon(colorPin(color))
  else if (layer instanceof L.Polygon) layer.setStyle({ color, weight: 3, fillColor: color, fillOpacity: 0.25 })
  else if (layer instanceof L.Polyline) layer.setStyle({ color, weight: 4 })
}
