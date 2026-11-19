import { unzipSync, strFromU8 } from 'fflate'

/**
 * A minimal, read-only .xlsx/.xlsm reader. It returns the values Excel saved
 * in each cell (the cached results of formulas). It never runs formulas or
 * macros: the VBA project inside an .xlsm is never even unzipped.
 */

export type CellValue = number | string | boolean | null

export type Workbook = {
  /** Sheet names exactly as written in the file. */
  sheetNames: string[]
  /** Finds a sheet by name, ignoring case and surrounding spaces. */
  sheet(name: string): Sheet | null
}

export type Sheet = {
  name: string
  /** Value of a cell such as "C47", or null when the cell is empty. */
  get(addr: string): CellValue
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENTITIES[e],
  )
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))
  return m ? decode(m[1]) : null
}

/** Text of every <t> in a run of XML, skipping phonetic hints (<rPh>). */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let out = ''
  for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1]
  return decode(out)
}

function parseSharedStrings(xml: string): string[] {
  return Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>/g), (m) => textOf(m[1]))
}

function parseSheet(xml: string, shared: string[]): Map<string, CellValue> {
  const cells = new Map<string, CellValue>()
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1]
    const body = m[2] ?? ''
    const r = attr(attrs, 'r')
    if (!r) continue
    const t = attr(attrs, 't') ?? 'n'
    const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
    let value: CellValue = null
    if (t === 'inlineStr') value = textOf(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '')
    else if (v == null) value = null
    else if (t === 's') value = shared[Number(v)] ?? null
    else if (t === 'b') value = v === '1'
    else if (t === 'str' || t === 'e') value = decode(v)
    else {
      const n = Number(v)
      value = Number.isFinite(n) ? n : null
    }
    if (value !== null) cells.set(r.toUpperCase(), value)
  }
  return cells
}

const norm = (s: string) => s.trim().toLowerCase()

/** Resolves a relationship target (relative to xl/) to a zip path. */
function zipPath(target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = ['xl', ...target.split('/')]
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.') out.push(p)
  }
  return out.join('/')
}

/**
 * Reads a workbook. `wanted` limits which sheets get parsed (by name, case and
 * spaces ignored), so big hidden lookup sheets are skipped.
 */
export function readWorkbook(data: ArrayBuffer | Uint8Array, wanted?: string[]): Workbook {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let index: Record<string, Uint8Array>
  try {
    index = unzipSync(bytes, {
      filter: (f) =>
        f.name === 'xl/workbook.xml' || f.name === 'xl/_rels/workbook.xml.rels' || f.name === 'xl/sharedStrings.xml',
    })
  } catch {
    throw new Error("This file isn't an Excel workbook (.xlsx or .xlsm). Older .xls files need to be saved as .xlsx first.")
  }
  const wbXml = index['xl/workbook.xml'] && strFromU8(index['xl/workbook.xml'])
  const relsXml = index['xl/_rels/workbook.xml.rels'] && strFromU8(index['xl/_rels/workbook.xml.rels'])
  if (!wbXml || !relsXml) throw new Error("This file isn't an Excel workbook (.xlsx or .xlsm).")

  const rels = new Map<string, string>()
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id')
    const target = attr(m[1], 'Target')
    if (id && target) rels.set(id, zipPath(target))
  }
  const sheets: { name: string; path: string }[] = []
  for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1], 'name')
    const rid = attr(m[1], 'r:id')
    const path = rid ? rels.get(rid) : undefined
    if (name && path) sheets.push({ name, path })
  }

  const want = wanted ? new Set(wanted.map(norm)) : null
  const chosen = sheets.filter((s) => !want || want.has(norm(s.name)))
  const paths = new Set(chosen.map((s) => s.path))
  const files = unzipSync(bytes, { filter: (f) => paths.has(f.name) })
  const shared = index['xl/sharedStrings.xml'] ? parseSharedStrings(strFromU8(index['xl/sharedStrings.xml'])) : []

  const parsed = new Map<string, Sheet>()
  for (const s of chosen) {
    const file = files[s.path]
    if (!file) continue
    const cells = parseSheet(strFromU8(file), shared)
    parsed.set(norm(s.name), { name: s.name, get: (addr) => cells.get(addr.toUpperCase()) ?? null })
  }
  return {
    sheetNames: sheets.map((s) => s.name),
    sheet: (name) => parsed.get(norm(name)) ?? null,
  }
}
