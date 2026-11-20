import { useMemo } from 'react'
import { hucGroups, type HucFields, type HucFilterValue } from './huc'

/**
 * Watershed dropdown: every HUC-8 the projects fall in, each with its HUC-10
 * watersheds underneath. Only lists watersheds that have projects.
 */
export default function HucFilter({
  rows,
  value,
  onChange,
}: {
  rows: HucFields[]
  value: HucFilterValue
  onChange: (v: HucFilterValue) => void
}) {
  const { groups, missing } = useMemo(() => hucGroups(rows), [rows])
  return (
    <select className="huc-filter" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Watershed">
      <option value="">All watersheds</option>
      {groups.map((g) => (
        <optgroup key={g.huc8} label={`${g.name ?? 'HUC-8'} · ${g.huc8}`}>
          <option value={`8:${g.huc8}`}>
            All of {g.name ?? g.huc8} (HUC-8) · {g.count}
          </option>
          {g.watersheds.map((w) => (
            <option key={w.huc10} value={`10:${w.huc10}`}>
              {w.name ?? w.huc10} · {w.huc10} · {w.count}
            </option>
          ))}
        </optgroup>
      ))}
      {missing > 0 && <option value="none">No watershed set · {missing}</option>}
    </select>
  )
}
