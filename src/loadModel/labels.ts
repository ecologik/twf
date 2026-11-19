/** Shared by the Load model tab and the workbook reader (which is loaded only on import). */

export type SheetKind = 'gully' | 'bank' | 'ag' | 'feedlot' | 'urban_rate' | 'urban_emc' | 'easement'

export const SHEET_LABEL: Record<SheetKind, string> = {
  gully: 'Gully stabilization',
  bank: 'Bank stabilization',
  ag: 'Ag fields & filter strips',
  feedlot: 'Feedlots',
  urban_rate: 'Urban runoff (loading rate)',
  urban_emc: 'Urban runoff (EMC)',
  easement: 'Conservation easement',
}

/** Which practice list (from the state guidance) goes with each tab. */
export const PRACTICE_SHEET: Record<SheetKind, string | null> = {
  gully: 'gully',
  bank: 'bank',
  ag: 'ag',
  feedlot: 'feedlot',
  urban_rate: 'urban',
  urban_emc: 'urban',
  easement: null,
}

export type Detail = [label: string, value: string]

/** One BMP read from the workbook, before it is saved. */
export type LoadEntryDraft = {
  sheet_kind: SheetKind
  /** The tab it came from, as named in the file. */
  source_sheet: string
  name: string
  practice: string | null
  life_years: number | null
  sediment_tons: number | null
  phosphorus_lb: number | null
  nitrogen_lb: number | null
  bod_lb: number | null
  /** Key inputs, formatted for display (the rows under each entry). */
  details: Detail[]
  /** The same inputs as raw values, for a calculator later. */
  inputs: Record<string, unknown>
  /** Things staff should look at before saving. */
  warnings: string[]
}


export function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  const digits = a >= 100 ? 1 : a >= 1 ? 2 : 4
  return n.toLocaleString('en-US', { maximumFractionDigits: digits })
}

/** Load figures: at most one decimal, like the prototype. */
export const fmt1 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

/**
 * Suggests one of the map's practice types (ids from the practice_types
 * table) for an entry, from its Region 5 practice and workbook tab. Returns
 * null when nothing clearly fits; staff can always pick one.
 */
export function suggestPracticeType(kind: SheetKind, practice: string | null, ids: Set<string>): string | null {
  const p = (practice ?? '').toLowerCase()
  const rules: [boolean, string][] = [
    [p.includes('cover crop'), 'cover-crop'],
    [p.includes('no till') || p.includes('reduced till'), 'no-till'],
    [p.includes('grassed waterway'), 'grassed-waterway'],
    [p.includes('filter strip'), 'filter-strip'],
    [p.includes('riparian'), 'riparian-buffer'],
    [p.includes('wetland'), 'wetland'],
    [p.includes('streambank') || kind === 'bank', 'streambank'],
    [kind === 'feedlot', 'feedlot'],
  ]
  for (const [hit, id] of rules) if (hit && ids.has(id)) return id
  return null
}
