import { R5_PRACTICES } from './practices'
import { fmt, type LoadEntryDraft, type SheetKind } from './labels'
export { fmt, SHEET_LABEL, PRACTICE_SHEET, type Detail, type LoadEntryDraft, type SheetKind } from './labels'
import { readWorkbook, type CellValue, type Sheet } from './xlsx'

/**
 * Reads the results an EPA Region 5 load-reduction workbook has already
 * calculated, one entry per filled-in BMP. Nothing is recalculated here: every
 * number is the value Excel saved in the cell. Cell addresses match the
 * Region 5 workbook TWF used (the "Walnut Creek" example); each tab is checked
 * against a few of its labels first, so a different layout is reported as
 * unrecognised instead of being read wrong.
 */

export type SkippedTab = { sheet: string; reason: string }
export type ImportResult = { entries: LoadEntryDraft[]; skipped: SkippedTab[] }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const numOrNull = (v: CellValue): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const n0 = (v: CellValue): number => numOrNull(v) ?? 0
const str = (v: CellValue): string => (v == null ? '' : String(v).trim())
const startsWith = (v: CellValue, prefix: string) => str(v).toLowerCase().startsWith(prefix.toLowerCase())
/** A reduction worth importing: a number above zero. */
const positive = (v: CellValue): number | null => {
  const n = numOrNull(v)
  return n != null && n > 0 ? n : null
}
const tons = (lb: number | null) => (lb == null ? null : lb / 2000)

const pct = (n: number) => `${fmt(n * 100)}%`

/** The label next to the first ticked checkbox, from [checkbox cell, label cell] pairs. */
function ticked(s: Sheet, pairs: [string, string][]): string | null {
  for (const [box, label] of pairs) if (s.get(box) === true) return str(s.get(label)) || null
  return null
}
function allTicked(s: Sheet, pairs: [string, string][]): string[] {
  return pairs.filter(([box]) => s.get(box) === true).map(([, label]) => str(s.get(label))).filter(Boolean)
}
const rows = (col: string, from: number, to: number, labelCol: string): [string, string][] =>
  Array.from({ length: to - from + 1 }, (_, i) => [`${col}${from + i}`, `${labelCol}${from + i}`])

function practiceByName(name: string) {
  return R5_PRACTICES.find((p) => p.name === name) ?? null
}
function withPractice(e: Omit<LoadEntryDraft, 'practice' | 'life_years'>, practice: string | null): LoadEntryDraft {
  const p = practice ? practiceByName(practice) : null
  return { ...e, practice: p?.name ?? null, life_years: p?.life ?? null }
}

/** One soil textural class picked on the Gully or Bank tab. */
function soilClass(s: Sheet, firstRow: number, rightRows: number): string | null {
  return ticked(s, [...rows('A', firstRow, firstRow + 4, 'B'), ...rows('D', firstRow, firstRow + rightRows - 1, 'E')])
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Reader = {
  kind: SheetKind
  names: string[]
  /** True when the tab's labels are where this reader expects them. */
  matches: (s: Sheet) => boolean
  read: (s: Sheet) => { entries: LoadEntryDraft[]; empty?: string }
}

const gully: Reader = {
  kind: 'gully',
  names: ['Gully Stabilization'],
  matches: (s) => startsWith(s.get('A47'), 'Top Width') && startsWith(s.get('A60'), 'Sediment Load Reduction'),
  read: (s) => {
    const sed = positive(s.get('D60'))
    if (sed == null) return { entries: [], empty: 'no gully dimensions entered' }
    const top = n0(s.get('C47')), bottom = n0(s.get('C48')), depth = n0(s.get('C49')), length = n0(s.get('C50'))
    const years = n0(s.get('C51')), eff = numOrNull(s.get('C60')), soil = soilClass(s, 20, 4)
    return {
      entries: [
        withPractice(
          {
            sheet_kind: 'gully',
            source_sheet: s.name,
            name: 'Gully stabilization',
            sediment_tons: sed,
            phosphorus_lb: numOrNull(s.get('D61')),
            nitrogen_lb: numOrNull(s.get('D62')),
            bod_lb: null,
            details: [
              ['Top / bottom width', `${fmt(top)} / ${fmt(bottom)} ft`],
              ['Depth × length', `${fmt(depth)} ft × ${fmt(length)} ft`],
              ['Years of formation', fmt(years)],
              ['Soil class', soil ?? '—'],
              ['BMP efficiency', fmt(eff)],
            ],
            inputs: {
              top_width_ft: top, bottom_width_ft: bottom, depth_ft: depth, length_ft: length, years,
              soil_class: soil, soil_weight: numOrNull(s.get('C52')), p_conc: numOrNull(s.get('C53')),
              n_conc: numOrNull(s.get('C54')), correction_factor: numOrNull(s.get('C55')), efficiency: eff,
            },
            warnings: [],
          },
          null,
        ),
      ],
    }
  },
}

const bank: Reader = {
  kind: 'bank',
  names: ['Bank Stabilization'],
  matches: (s) => startsWith(s.get('A44'), 'Length') && startsWith(s.get('A58'), 'Sediment Load Reduction'),
  read: (s) => {
    const soil = soilClass(s, 15, 4)
    const banks = [
      { n: 1, input: 'C', eff: 'C58', result: 'E' },
      { n: 2, input: 'D', eff: 'D58', result: 'F' },
    ].filter((b) => positive(s.get(`${b.result}58`)) != null)
    if (!banks.length) return { entries: [], empty: 'no bank lengths entered' }
    return {
      entries: banks.map((b) => {
        const length = n0(s.get(`${b.input}44`)), height = n0(s.get(`${b.input}45`)), lrr = n0(s.get(`${b.input}46`))
        const eff = numOrNull(s.get(b.eff))
        return withPractice(
          {
            sheet_kind: 'bank',
            source_sheet: s.name,
            name: banks.length > 1 ? `Bank stabilization, bank ${b.n}` : 'Bank stabilization',
            sediment_tons: positive(s.get(`${b.result}58`)),
            phosphorus_lb: numOrNull(s.get(`${b.result}59`)),
            nitrogen_lb: numOrNull(s.get(`${b.result}60`)),
            bod_lb: null,
            details: [
              ['Bank length', `${fmt(length)} ft`],
              ['Bank height', `${fmt(height)} ft`],
              ['Lateral recession', `${fmt(lrr)} ft/yr`],
              ['Soil class', soil ?? '—'],
              ['BMP efficiency', fmt(eff)],
            ],
            inputs: {
              bank: b.n, length_ft: length, height_ft: height, lateral_recession_ft_yr: lrr, soil_class: soil,
              soil_weight: numOrNull(s.get(`${b.input}47`)), p_conc: numOrNull(s.get(`${b.input}48`)),
              n_conc: numOrNull(s.get(`${b.input}49`)), correction_factor: numOrNull(s.get(`${b.input}50`)),
              efficiency: eff,
            },
            warnings: [],
          },
          'Streambank and Shoreline Protection (580)(ft)',
        )
      }),
    }
  },
}

const ag: Reader = {
  kind: 'ag',
  names: ['Ag Fields & Filter Strips'],
  matches: (s) => startsWith(s.get('A29'), 'Enter contributing area') && startsWith(s.get('A79'), 'Sediment Load Reduction'),
  read: (s) => {
    const sed = positive(s.get('C79'))
    const p = positive(s.get('C80'))
    if (sed == null && p == null) return { entries: [], empty: 'no contributing area or C/P change entered' }
    const R = n0(s.get('C21')), K = n0(s.get('C22')), LS = n0(s.get('C23'))
    const cB = n0(s.get('C24')), cA = n0(s.get('D24')), pB = n0(s.get('C25')), pA = n0(s.get('D25'))
    const acres = n0(s.get('C29'))
    const texture = ticked(s, rows('A', 42, 45, 'B'))
    const strip = s.get('A14') === true
    const fs = [n0(s.get('C73')), n0(s.get('C74')), n0(s.get('C75'))]
    const state = str(s.get('C15')), county = str(s.get('E15'))
    const warnings: string[] = []
    if (s.get('A13') !== true) warnings.push('The "agricultural field practice" box is not ticked, so only the filter strip counts.')
    return {
      entries: [
        withPractice(
          {
            sheet_kind: 'ag',
            source_sheet: s.name,
            name: strip ? 'Field practice and filter strip' : 'Field practice',
            sediment_tons: sed,
            phosphorus_lb: p,
            nitrogen_lb: numOrNull(s.get('C81')),
            bod_lb: null,
            details: [
              ['Contributing area', `${fmt(acres)} acres`],
              ['County', [county, state].filter(Boolean).join(', ') || '—'],
              ['County factors', `R ${fmt(R)} · K ${fmt(K)} · LS ${fmt(LS)}`],
              ['C factor', `${fmt(cB)} → ${fmt(cA)}`],
              ['P factor', `${fmt(pB)} → ${fmt(pA)}`],
              ['Sediment texture', texture ? texture.split(' (')[0] : '—'],
              ['Filter strip', strip ? `yes, ${pct(fs[0])} / ${pct(fs[1])} / ${pct(fs[2])} S/P/N` : 'no'],
            ],
            inputs: {
              state, county, acres, R, K, LS, R_after: numOrNull(s.get('D21')), K_after: numOrNull(s.get('D22')),
              LS_after: numOrNull(s.get('D23')), c_before: cB, c_after: cA, p_before: pB, p_after: pA,
              texture, field_practice: s.get('A13') === true, filter_strip: strip,
              filter_strip_efficiency: strip ? { sediment: fs[0], phosphorus: fs[1], nitrogen: fs[2] } : null,
              field_only: { sediment_tons: numOrNull(s.get('C67')), phosphorus_lb: numOrNull(s.get('C68')), nitrogen_lb: numOrNull(s.get('C69')) },
              filter_strip_only: strip ? { sediment_tons: numOrNull(s.get('D73')), phosphorus_lb: numOrNull(s.get('D74')), nitrogen_lb: numOrNull(s.get('D75')) } : null,
            },
            warnings,
          },
          null,
        ),
      ],
    }
  },
}

/** Feedlot BMP checkboxes, from the formulas in G82:G83. */
const FEEDLOT_BMPS: [string, string][] = [
  ['C82', 'No BMP'], ['C83', 'Diversion'], ['C85', 'Filter strip'], ['C87', 'Runoff management system'], ['C89', 'Terrace'],
  ['D82', 'Waste management'], ['D83', 'Waste storage facility'], ['D85', 'Solids separation basin'],
  ['D86', 'Solids separation basin with infiltration bed'],
]

const feedlot: Reader = {
  kind: 'feedlot',
  names: ['Feedlots'],
  matches: (s) => startsWith(s.get('B107'), 'Phosphorus load') && startsWith(s.get('B108'), 'Nitrogen load'),
  read: (s) => {
    const n = positive(s.get('F108')), p = positive(s.get('F107'))
    if (n == null && p == null) return { entries: [], empty: 'no animals or BMP entered' }
    const bmps = FEEDLOT_BMPS.filter(([c]) => s.get(c) === true).map(([, l]) => l).filter((l) => l !== 'No BMP')
    const paved = ticked(s, rows('B', 24, 27, 'C'))
    const herd = Array.from({ length: 11 }, (_, i) => ({ count: n0(s.get(`B${38 + i}`)), type: str(s.get(`C${38 + i}`)) }))
      .filter((a) => a.count > 0)
    const state = str(s.get('B31')), county = str(s.get('D31')), station = str(s.get('E31'))
    const sedNum = positive(s.get('J84'))
    const bmpLower = bmps.join(' ').toLowerCase()
    const practice = bmpLower.includes('waste storage') ? 'Waste Storage Facility (313)(number)' : null
    return {
      entries: [
        withPractice(
          {
            sheet_kind: 'feedlot',
            source_sheet: s.name,
            name: 'Feedlot',
            sediment_tons: sedNum,
            phosphorus_lb: p,
            nitrogen_lb: n,
            bod_lb: positive(s.get('F106')),
            details: [
              ['Lot area', `${fmt(n0(s.get('B18')))} acres`],
              ['Paved share', paved ?? '—'],
              ['Herd', herd.map((a) => `${fmt(a.count)} ${a.type.toLowerCase()}`).join(', ') || '—'],
              ['County', [county, state].filter(Boolean).join(', ') || '—'],
              ['Weather station', station || '—'],
              ['BMP', bmps.join(' + ') || '—'],
            ],
            inputs: {
              acres: n0(s.get('B18')), paved, herd, state, county, station, bmps,
              load_before: { bod_lb: numOrNull(s.get('E106')), phosphorus_lb: numOrNull(s.get('E107')), nitrogen_lb: numOrNull(s.get('E108')) },
            },
            warnings: [],
          },
          practice,
        ),
      ],
    }
  },
}

const URBAN_LU = ['Commercial', 'Industrial', 'Institutional', 'Transportation', 'Multi-Family', 'Residential', 'Agriculture', 'Vacant', 'Open Space']

/** Urban BMP names in the workbook → practice in the state list, where one clearly fits. */
const URBAN_PRACTICE: Record<string, string> = {
  'green roof': 'Urban: Green Roof (square feet)',
  'porous pavement': 'Urban: Pervious Pavement (square feet)',
  'sand filters': 'Urban: Sand Filters (number)',
  'grass swales': 'Urban: Vegetated Swales (ft)',
  'wetland detention': 'Urban: Constructed Stormwater Wetlands (acres)',
  bioretention: 'Urban: Bioretention (square feet)',
}

const urbanRate: Reader = {
  kind: 'urban_rate',
  names: ['Urban Runoff Loading Rate'],
  matches: (s) => str(s.get('A169')) === 'TSS' && str(s.get('A177')) === 'TP' && str(s.get('B58')) === 'Commercial',
  read: (s) => {
    const tssLb = positive(s.get('F169')), tp = positive(s.get('F177'))
    if (tssLb == null && tp == null) return { entries: [], empty: 'no BMP ticked or no land use acres entered' }
    const bmps = allTicked(s, [...rows('A', 10, 16, 'B'), ...rows('E', 10, 16, 'F'), ...rows('H', 10, 14, 'J')])
    const landUse = URBAN_LU.map((lu, i) => ({ land_use: lu, sewered: n0(s.get(`D${58 + i}`)), unsewered: n0(s.get(`F${58 + i}`)) }))
      .filter((r) => r.sewered + r.unsewered > 0)
    const sewered = landUse.reduce((a, r) => a + r.sewered, 0)
    const unsewered = landUse.reduce((a, r) => a + r.unsewered, 0)
    const warnings: string[] = []
    const effSum = [n0(s.get('I41')), n0(s.get('S41')), n0(s.get('Y41'))]
    if (effSum.some((e) => e >= 1))
      warnings.push(`The ticked BMPs add up to ${pct(Math.max(...effSum))} removal, so the whole load counts as removed. Check the workbook before saving.`)
    if (bmps.length > 1) warnings.push('More than one BMP is ticked. The workbook adds their efficiencies together.')
    const practice = bmps.length === 1 ? URBAN_PRACTICE[bmps[0].toLowerCase()] ?? null : null
    return {
      entries: [
        withPractice(
          {
            sheet_kind: 'urban_rate',
            source_sheet: s.name,
            name: bmps.length === 1 ? bmps[0] : 'Urban runoff',
            sediment_tons: tons(tssLb),
            phosphorus_lb: tp,
            nitrogen_lb: positive(s.get('F174')),
            bod_lb: positive(s.get('F167')),
            details: [
              ['BMP', bmps.join(' + ') || '—'],
              ['Drainage area', `${fmt(sewered + unsewered)} acres (${fmt(sewered)} sewered, ${fmt(unsewered)} unsewered)`],
              ['Land use', landUse.map((r) => `${r.land_use} ${fmt(r.sewered + r.unsewered)}`).join(' · ') || '—'],
              ['Loading rates', s.get('B71') === true ? 'Default' : 'User defined'],
            ],
            inputs: { bmps, land_use: landUse, default_rates: s.get('B71') === true, tss_lb: tssLb },
            warnings,
          },
          practice,
        ),
      ],
    }
  },
}

const urbanEmc: Reader = {
  kind: 'urban_emc',
  names: ['Urban Runoff EMC'],
  matches: (s) => startsWith(s.get('A60'), 'TN (lb/yr)') && startsWith(s.get('A63'), 'Sediment (lb/yr)'),
  read: (s) => {
    const sedLb = positive(s.get('C63')), tp = positive(s.get('C61')), tn = positive(s.get('C60'))
    const bmps = Array.from({ length: 9 }, (_, i) => ({
      land_use: str(s.get(`A${34 + i}`)),
      bmp: str(s.get(`B${34 + i}`)),
      acres: n0(s.get(`E${34 + i}`)),
    })).filter((r) => r.bmp && r.bmp !== 'No BMP')
    if (!bmps.length) return { entries: [], empty: 'every land use is set to "No BMP"' }
    if (sedLb == null && tp == null && tn == null) return { entries: [], empty: 'the BMPs it lists reduce nothing' }
    const state = str(s.get('A6')), county = str(s.get('C6'))
    const names = [...new Set(bmps.map((b) => b.bmp))]
    return {
      entries: [
        withPractice(
          {
            sheet_kind: 'urban_emc',
            source_sheet: s.name,
            name: names.length === 1 ? names[0] : 'Urban runoff',
            sediment_tons: tons(sedLb),
            phosphorus_lb: tp,
            nitrogen_lb: tn,
            bod_lb: positive(s.get('C62')),
            details: [
              ['BMPs', bmps.map((b) => `${b.land_use}: ${b.bmp} (${fmt(b.acres)} ac)`).join(' · ')],
              ['Urban area', `${fmt(n0(s.get('B29')))} acres`],
              ['County', [county, state].filter(Boolean).join(', ') || '—'],
              ['Hydrologic soil group', str(s.get('A16')) || '—'],
            ],
            inputs: { bmps, state, county, station: str(s.get('E6')), hsg: str(s.get('A16')), sediment_lb: sedLb },
            warnings: [],
          },
          names.length === 1 ? URBAN_PRACTICE[names[0].toLowerCase()] ?? null : null,
        ),
      ],
    }
  },
}

const easement: Reader = {
  kind: 'easement',
  names: ['Conservation Easements'],
  matches: (s) => str(s.get('A67')) === 'TSS' && str(s.get('A75')) === 'TP',
  read: (s) => {
    const tssLb = positive(s.get('D67')), tp = positive(s.get('D75'))
    if (tssLb == null && tp == null) return { entries: [], empty: 'no easement acres entered' }
    const landUse = Array.from({ length: 7 }, (_, i) => ({
      land_use: str(s.get(`G${20 + i}`)),
      sewered: n0(s.get(`J${20 + i}`)),
      unsewered: n0(s.get(`L${20 + i}`)),
    })).filter((r) => r.sewered + r.unsewered > 0)
    return {
      entries: [
        withPractice(
          {
            sheet_kind: 'easement',
            source_sheet: s.name,
            name: 'Conservation easement',
            sediment_tons: tons(tssLb),
            phosphorus_lb: tp,
            nitrogen_lb: positive(s.get('D72')),
            bod_lb: positive(s.get('D65')),
            details: [
              ['Easement area', `${fmt(n0(s.get('D18')))} acres`],
              ['Probable use avoided', landUse.map((r) => `${r.land_use} ${fmt(r.sewered + r.unsewered)} ac`).join(' · ') || '—'],
            ],
            inputs: { acres: n0(s.get('D18')), land_use: landUse, tss_lb: tssLb },
            warnings: [],
          },
          null,
        ),
      ],
    }
  },
}

const READERS = [gully, bank, ag, feedlot, urbanRate, urbanEmc, easement]
/** Helper tabs that never hold a BMP of their own. */
const HELPER_TABS = ['Instructions', 'Green Roof', 'WeatherData', 'CountyData']

const norm = (s: string) => s.trim().toLowerCase()

/** Reads every BMP tab in a Region 5 workbook. Throws if the file can't be opened. */
export function readRegion5(data: ArrayBuffer | Uint8Array): ImportResult {
  const wanted = READERS.flatMap((r) => r.names)
  const wb = readWorkbook(data, wanted)
  const entries: LoadEntryDraft[] = []
  const skipped: SkippedTab[] = []
  let found = 0
  for (const r of READERS) {
    const s = r.names.map((n) => wb.sheet(n)).find(Boolean)
    if (!s) continue
    found++
    if (!r.matches(s)) {
      skipped.push({ sheet: s.name, reason: "its layout doesn't match the Region 5 version this import knows, so nothing was read from it" })
      continue
    }
    const out = r.read(s)
    entries.push(...out.entries)
    if (!out.entries.length && out.empty) skipped.push({ sheet: s.name, reason: out.empty })
  }
  if (!found) {
    const known = new Set([...wanted, ...HELPER_TABS].map(norm))
    const others = wb.sheetNames.filter((n) => !known.has(norm(n)))
    throw new Error(
      `This doesn't look like a Region 5 load-reduction workbook. None of its tabs are BMP worksheets${others.length ? ` (found: ${others.slice(0, 6).join(', ')})` : ''}.`,
    )
  }
  return { entries, skipped }
}
