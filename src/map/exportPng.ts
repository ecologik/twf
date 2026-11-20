import L from 'leaflet'
import { HUC_PANE } from './huc'
import { drawPin } from './pins'

export type ExportShape = {
  layer: L.Layer
  color: string
  /** Shown in a badge on the map and in the key. */
  number: number
  /** The shape's own label ("Field A1"), or '' if it has none. */
  name: string
  /** Practice type name ("Cover crop"). */
  practice: string
}

/** One numbered entry: a shape, or several shapes that share a number. */
type Entry = { number: number; name: string; parts: { practice: string; color: string }[]; shapes: ExportShape[] }

const FONT = "'Source Sans 3 Variable', system-ui, sans-serif"

/** Shortens text with an ellipsis so it fits in `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, color: string, r = 10) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.fillStyle = '#111'
  ctx.font = `700 ${n > 99 ? 9 : 11}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(n), x, y + 0.5)
}

/**
 * Draws what the map shows right now (tiles, shapes and pins) onto a canvas,
 * puts a numbered badge on each shape, and adds a key underneath listing each
 * number's name and practice (and project, when given). Returns a PNG Blob,
 * which keeps this independent of where the image ends up: a download today,
 * the project's Drive folder later.
 */
export async function mapToPng(map: L.Map, shapes: ExportShape[], caption?: string, scale = 2): Promise<Blob> {
  const container = map.getContainer()
  const box = container.getBoundingClientRect()
  const { x: w, y: h } = map.getSize()
  const pt = (ll: L.LatLng) => map.latLngToContainerPoint(ll)

  // Only shapes that are actually in the picture go in the key.
  const view = map.getBounds()
  const shown = shapes
    .filter(({ layer }) =>
      layer instanceof L.Marker
        ? view.contains(layer.getLatLng())
        : layer instanceof L.Polyline && view.intersects(layer.getBounds()),
    )
    .sort((a, b) => a.number - b.number)

  // Shapes that share a number (e.g. all of one project's shapes on the
  // all-projects map) get one badge and one key row.
  const entries: Entry[] = []
  for (const s of shown) {
    let e = entries.find((x) => x.number === s.number)
    if (!e) entries.push((e = { number: s.number, name: s.name, parts: [], shapes: [] }))
    e.shapes.push(s)
    if (!e.parts.some((p) => p.practice === s.practice)) e.parts.push({ practice: s.practice, color: s.color })
  }

  // Key layout: one or two columns of rows under the map.
  const cols = entries.length > 10 && w >= 640 ? 2 : 1
  const rowH = 22
  const perCol = Math.ceil(entries.length / cols)
  const keyTop = h
  const keyH = entries.length || caption ? 44 + perCol * rowH + 10 : 0

  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = (h + keyH) * scale
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

  const ringsOf = (layer: L.Polyline | L.Polygon) => {
    const rings: L.LatLng[][] = []
    const collect = (x: unknown) => {
      if (Array.isArray(x) && x.length && x[0] instanceof L.LatLng) rings.push(x as L.LatLng[])
      else if (Array.isArray(x)) x.forEach(collect)
    }
    collect(layer.getLatLngs())
    return rings
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()

  // Faint watershed outlines (HucLayer), drawn with the style they have on screen.
  map.eachLayer((layer) => {
    if (!(layer instanceof L.Polygon) || layer.options.pane !== HUC_PANE || !view.intersects(layer.getBounds())) return
    const o = layer.options
    ctx.beginPath()
    for (const ring of ringsOf(layer)) {
      ring.forEach((ll, i) => {
        const p = pt(ll)
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.closePath()
    }
    ctx.globalAlpha = o.fillOpacity ?? 0
    ctx.fillStyle = o.fillColor ?? o.color ?? '#000'
    ctx.fill('evenodd')
    ctx.globalAlpha = o.opacity ?? 1
    ctx.lineWidth = o.weight ?? 1
    ctx.strokeStyle = o.color ?? '#000'
    ctx.setLineDash(o.dashArray ? String(o.dashArray).split(/[ ,]+/).map(Number) : [])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  })

  // Areas and lines, drawn from their coordinates so they come out crisp.
  for (const { layer, color } of shown) {
    if (!(layer instanceof L.Polyline)) continue
    const isArea = layer instanceof L.Polygon
    const rings = ringsOf(layer)
    ctx.beginPath()
    for (const ring of rings) {
      ring.forEach((ll, i) => {
        const p = pt(ll)
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      if (isArea) ctx.closePath()
    }
    if (isArea) {
      ctx.globalAlpha = 0.25
      ctx.fillStyle = color
      ctx.fill('evenodd')
      ctx.globalAlpha = 1
    }
    ctx.lineWidth = isArea ? 3 : 4
    ctx.strokeStyle = color
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  // Points.
  for (const { layer, color } of shown) {
    if (layer instanceof L.Marker) {
      const p = pt(layer.getLatLng())
      drawPin(ctx, p.x, p.y, color)
    }
  }

  // Number badges sit beside their shapes, not on them, with a short leader
  // line back to the shapes. Each badge tries eight spots around its shapes'
  // box and takes the first that stays in the picture and clear of the other
  // shapes and badges.
  type Box = { x0: number; y0: number; x1: number; y1: number }
  const boxOf = (list: ExportShape[]): Box => {
    const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    const add = (x0: number, y0: number, x1: number, y1: number) => {
      b.x0 = Math.min(b.x0, x0)
      b.y0 = Math.min(b.y0, y0)
      b.x1 = Math.max(b.x1, x1)
      b.y1 = Math.max(b.y1, y1)
    }
    for (const { layer } of list) {
      if (layer instanceof L.Marker) {
        const p = pt(layer.getLatLng())
        add(p.x - 9, p.y - 26, p.x + 9, p.y) // the pin's own outline
      } else if (layer instanceof L.Polyline) {
        const lb = layer.getBounds()
        const a = pt(lb.getNorthWest())
        const c = pt(lb.getSouthEast())
        add(a.x, a.y, c.x, c.y)
      }
    }
    return b
  }
  const R = 11 // badge radius plus a little air
  const bottom = h - 24 // keep clear of the credits strip
  const boxes = entries.map((e) => boxOf(e.shapes))
  const hitsBox = (x: number, y: number, b: Box) =>
    x > b.x0 - R && x < b.x1 + R && y > b.y0 - R && y < b.y1 + R
  const placed: { x: number; y: number }[] = []
  const DIRS: [number, number][] = [[1, -1], [1, 0], [1, 1], [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1]]

  entries.forEach((e, i) => {
    const b = boxes[i]
    // The part of the shapes that's in the picture.
    const v: Box = { x0: Math.max(b.x0, 0), y0: Math.max(b.y0, 0), x1: Math.min(b.x1, w), y1: Math.min(b.y1, bottom) }
    const cx = (v.x0 + v.x1) / 2
    const cy = (v.y0 + v.y1) / 2
    let best: { x: number; y: number; score: number } | null = null
    DIRS.forEach(([dx, dy], k) => {
      const gap = dx && dy ? 20 : 28
      const x = dx > 0 ? v.x1 + gap : dx < 0 ? v.x0 - gap : cx
      const y = dy > 0 ? v.y1 + gap : dy < 0 ? v.y0 - gap : cy
      if (x < 12 || x > w - 12 || y < 12 || y > bottom - 12) return
      let score = k
      boxes.forEach((o, j) => {
        if (hitsBox(x, y, o)) score += j === i ? 1000 : 100
      })
      for (const q of placed) if (Math.hypot(q.x - x, q.y - y) < 2 * R + 2) score += 500
      if (!best || score < best.score) best = { x, y, score }
    })
    const color = e.parts[0].color
    const spot = best as { x: number; y: number; score: number } | null
    if (!spot) {
      // A shape bigger than the picture: badge in the middle of what shows.
      const x = Math.min(Math.max(cx, 12), w - 12)
      const y = Math.min(Math.max(cy, 12), bottom - 12)
      badge(ctx, x, y, e.number, color)
      placed.push({ x, y })
      return
    }
    // Leader line from the badge to the nearest edge of the shapes' box.
    const ex = Math.min(Math.max(spot.x, v.x0), v.x1)
    const ey = Math.min(Math.max(spot.y, v.y0), v.y1)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(spot.x, spot.y)
    ctx.lineTo(ex, ey)
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.strokeStyle = color
    ctx.stroke()
    badge(ctx, spot.x, spot.y, e.number, color)
    placed.push(spot)
  })
  ctx.restore()

  // Map credits (bottom right of the map), which the tile providers require
  // on any copy of the map.
  const credits = (container.querySelector('.leaflet-control-attribution')?.textContent ?? '').replace(/^.*?Leaflet\s*\|\s*/, '')
  if (credits) {
    ctx.font = `11px ${FONT}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    const tw = ctx.measureText(credits).width
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(w - tw - 12, h - 20, tw + 12, 20)
    ctx.fillStyle = '#222'
    ctx.fillText(credits, w - 6, h - 4)
  }

  // Key.
  if (keyH) {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, keyTop, w, keyH)
    ctx.fillStyle = '#d6d6d0'
    ctx.fillRect(0, keyTop, w, 1)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#111'
    ctx.font = `600 14px ${FONT}`
    ctx.fillText(fit(ctx, caption || 'Key', w - 24), 12, keyTop + 20)
    if (!entries.length) {
      ctx.font = `12px ${FONT}`
      ctx.fillStyle = '#666'
      ctx.fillText('No shapes in view.', 12, keyTop + 44)
    }

    const colW = (w - 24) / cols
    entries.forEach((e, i) => {
      const col = Math.floor(i / perCol)
      const x = 12 + col * colW
      const y = keyTop + 44 + (i % perCol) * rowH + rowH / 2
      badge(ctx, x + 10, y, e.number, e.parts[0].color, 9)

      // Name, then the practice(s) with their colour swatches.
      const textW = colW - 34
      const nameW = Math.min(textW * 0.5, 300)
      let tx = x + 28
      ctx.textAlign = 'left'
      ctx.font = `600 12px ${FONT}`
      ctx.fillStyle = '#111'
      ctx.fillText(fit(ctx, e.name || '—', nameW - 10), tx, y)
      tx += nameW
      for (const p of e.parts) {
        ctx.fillStyle = p.color
        ctx.fillRect(tx, y - 5, 10, 10)
        tx += 13
      }
      ctx.font = `12px ${FONT}`
      ctx.fillStyle = '#333'
      ctx.fillText(fit(ctx, e.parts.map((p) => p.practice).join(', '), x + colW - tx - 10), tx + 2, y)
    })
  }

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
