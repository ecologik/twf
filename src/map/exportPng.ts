import L from 'leaflet'

type Labelled = { layer: L.Layer; label: string }

/**
 * Draws what the map shows right now (tiles, shapes, pins and labels) onto a
 * canvas and returns it as a PNG. Returning a Blob keeps this independent of
 * where the image ends up: a download today, the project's Drive folder later.
 */
export async function mapToPng(map: L.Map, shapes: Labelled[], caption?: string, scale = 2): Promise<Blob> {
  const container = map.getContainer()
  const box = container.getBoundingClientRect()
  const { x: w, y: h } = map.getSize()

  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = '#dcdcd6'
  ctx.fillRect(0, 0, w, h)

  // Tiles: each tile layer in order, and within a layer the zoom levels from
  // lowest z-index up, so leftover tiles from an earlier zoom sit underneath.
  for (const layerEl of container.querySelectorAll<HTMLElement>('.leaflet-tile-pane > .leaflet-layer')) {
    const levels = [...layerEl.querySelectorAll<HTMLElement>('.leaflet-tile-container')].sort(
      (a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0),
    )
    for (const level of levels) {
      for (const img of level.querySelectorAll<HTMLImageElement>('img.leaflet-tile-loaded')) {
        const r = img.getBoundingClientRect()
        ctx.drawImage(img, r.left - box.left, r.top - box.top, r.width, r.height)
      }
    }
  }

  // Shapes, drawn from their coordinates so they come out crisp.
  const pt = (ll: L.LatLng) => map.latLngToContainerPoint(ll)
  const trace = (ring: L.LatLng[], close: boolean) => {
    ring.forEach((ll, i) => {
      const p = pt(ll)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    if (close) ctx.closePath()
  }
  for (const { layer } of shapes) {
    if (!(layer instanceof L.Polyline)) continue
    const o = layer.options
    const isArea = layer instanceof L.Polygon
    ctx.beginPath()
    const lls = layer.getLatLngs() as unknown
    // Polygons nest rings (and multi-polygons nest again); lines may be multi-lines.
    const rings: L.LatLng[][] = []
    const collect = (x: unknown) => {
      if (Array.isArray(x) && x.length && x[0] instanceof L.LatLng) rings.push(x as L.LatLng[])
      else if (Array.isArray(x)) x.forEach(collect)
    }
    collect(lls)
    rings.forEach((r) => trace(r, isArea))
    if (isArea && o.fill !== false) {
      ctx.globalAlpha = o.fillOpacity ?? 0.2
      ctx.fillStyle = o.fillColor ?? o.color ?? '#3388ff'
      ctx.fill('evenodd')
      ctx.globalAlpha = 1
    }
    ctx.lineWidth = o.weight ?? 3
    ctx.strokeStyle = o.color ?? '#3388ff'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  // Pins: copy the marker images as they sit on the map.
  for (const img of container.querySelectorAll<HTMLImageElement>('.leaflet-marker-pane img.leaflet-marker-icon')) {
    const r = img.getBoundingClientRect()
    ctx.drawImage(img, r.left - box.left, r.top - box.top, r.width, r.height)
  }

  // Labels with a dark halo so they read on satellite and streets alike.
  ctx.font = '600 13px Inter, system-ui, sans-serif'
  ctx.lineJoin = 'round'
  for (const { layer, label } of shapes) {
    if (!label) continue
    let p: L.Point
    let align: CanvasTextAlign = 'center'
    if (layer instanceof L.Marker) {
      p = pt(layer.getLatLng()).add([10, -12])
      align = 'left'
    } else if (layer instanceof L.Polyline) {
      p = pt(layer.getCenter())
    } else continue
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'
    ctx.strokeText(label, p.x, p.y)
    ctx.fillStyle = '#fff'
    ctx.fillText(label, p.x, p.y)
  }

  // Caption (bottom left) and the map credits (bottom right), which the tile
  // providers require on any copy of the map.
  const credits = (container.querySelector('.leaflet-control-attribution')?.textContent ?? '').replace(/^.*?Leaflet\s*\|\s*/, '')
  ctx.font = '11px Inter, system-ui, sans-serif'
  ctx.textBaseline = 'bottom'
  const strip = (text: string, x: number, align: CanvasTextAlign, bold = false) => {
    if (!text) return
    ctx.font = `${bold ? '600 12px' : '11px'} Inter, system-ui, sans-serif`
    ctx.textAlign = align
    const tw = ctx.measureText(text).width
    const bx = align === 'right' ? x - tw - 6 : x - 6
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(bx, h - 20, tw + 12, 20)
    ctx.fillStyle = '#222'
    ctx.fillText(text, x, h - 4)
  }
  strip(credits, w - 6, 'right')
  if (caption) strip(caption, 6, 'left', true)

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image.'))), 'image/png')
    } catch (e) {
      // A tile server that doesn't allow copying "taints" the canvas.
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
