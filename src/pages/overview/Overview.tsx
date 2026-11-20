import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FT_PER_MILE, M_PER_FT, SQ_M_PER_ACRE, shapeSize } from '../../lib/geo'
import { UNSET_COLOR, usePracticeTypes } from '../../lib/practices'
import { supabase } from '../../lib/supabase'
import { hucLabel } from '../../map/huc'
import { STAGES } from '../projects/stages'
import { PROJECT_COLUMNS, type Project } from '../projects/types'

type Load = {
  id: string
  project_id: string
  practice_type: string | null
  sediment_tons: number | null
  phosphorus_lb: number | null
  nitrogen_lb: number | null
  created_at: string
}

type Metric = 'sed' | 'p' | 'n'
const METRICS: Record<Metric, { label: string; unit: string; key: keyof Load }> = {
  sed: { label: 'Sediment', unit: 'tons/yr', key: 'sediment_tons' },
  p: { label: 'Phosphorus', unit: 'lb/yr', key: 'phosphorus_lb' },
  n: { label: 'Nitrogen', unit: 'lb/yr', key: 'nitrogen_lb' },
}

/** Stages that count as "underway": past Planning and not yet closed out. */
const UNDERWAY = new Set(['design', 'contracted', 'construction', 'installed', 'monitoring'])

const NONE = '__none__'

const num = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits })
/** Whole numbers once a figure is big; one decimal below 100. */
const smart = (n: number) => num(n, Math.abs(n) < 100 ? 1 : 0)

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 86400 * 14) return `${Math.round(s / 86400)} d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Per practice type: projects, mapped size and modelled load. */
type TypeRow = {
  key: string
  name: string
  color: string
  projects: Set<string>
  acres: number
  feet: number
  points: number
  sed: number
  p: number
  n: number
  entries: number
}

function Tile({ dot, label, value, unit, sub, children }: {
  dot?: string
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="ov-tile">
      <div className="ov-label">
        {dot && <span className="ov-dot" style={{ background: dot }} />}
        {label}
      </div>
      <div className="ov-value">
        {value}
        {unit && <span className="ov-unit"> {unit}</span>}
      </div>
      {sub && <div className="ov-sub">{sub}</div>}
      {children}
    </div>
  )
}

/** A tile for a figure the dashboard doesn't track yet. */
function PendingTile({ label, needs, hero }: { label: string; needs: string; hero?: boolean }) {
  return (
    <div className={`ov-tile ov-pending${hero ? ' ov-hero' : ''}`}>
      <div className="ov-label">{label}</div>
      <div className="ov-value" aria-label="Not tracked yet">—</div>
      <div className="ov-sub">{needs}</div>
      <span className="ov-soon">Not tracked yet</span>
    </div>
  )
}

/** Horizontal bars, one row each; a single measure, so one axis. */
function HBars({ rows, fmt, empty }: {
  rows: { key: string; label: ReactNode; title: string; value: number; color?: string; to?: string }[]
  fmt: (n: number) => string
  empty: ReactNode
}) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (!rows.length || max === 0) return <div className="ov-empty">{empty}</div>
  return (
    <ul className="ov-bars">
      {rows.map((r) => {
        const body = (
          <>
            <span className="ov-bar-label">{r.label}</span>
            <span className="ov-bar-track">
              <span
                className="ov-bar"
                style={{ width: `${r.value ? Math.max(1.5, (r.value / max) * 100) : 0}%`, background: r.color ?? 'var(--accent)' }}
              />
            </span>
            <span className="ov-bar-value mono">{fmt(r.value)}</span>
          </>
        )
        return (
          <li key={r.key} title={`${r.title}: ${fmt(r.value)}`}>
            {r.to ? <Link to={r.to} className="ov-bar-row">{body}</Link> : <span className="ov-bar-row">{body}</span>}
          </li>
        )
      })}
    </ul>
  )
}

export default function Overview() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [loads, setLoads] = useState<Load[]>([])
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric>('sed')
  const { types } = usePracticeTypes()

  useEffect(() => {
    supabase
      .from('projects')
      .select(PROJECT_COLUMNS)
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setProjects((data ?? []) as Project[])
      })
    supabase
      .from('load_model_entries')
      .select('id, project_id, practice_type, sediment_tons, phosphorus_lb, nitrogen_lb, created_at')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setLoads((data ?? []) as Load[])
      })
  }, [])

  const list = useMemo(() => projects ?? [], [projects])
  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list])

  /** Everything the tiles and cards need, in one pass over shapes and loads. */
  const stats = useMemo(() => {
    const known = new Map(types.map((t) => [t.id, t]))
    const rows = new Map<string, TypeRow>()
    const row = (id: string | null | undefined): TypeRow => {
      const key = id && known.has(id) ? id : NONE
      if (!rows.has(key)) {
        const t = known.get(key)
        rows.set(key, {
          key,
          name: t?.name ?? 'No practice type',
          color: t?.color ?? UNSET_COLOR,
          projects: new Set(),
          acres: 0, feet: 0, points: 0, sed: 0, p: 0, n: 0, entries: 0,
        })
      }
      return rows.get(key)!
    }
    let acres = 0
    let feet = 0
    let areas = 0
    let lines = 0
    let untaggedShapes = 0
    for (const p of list) {
      for (const f of p.map_shapes?.features ?? []) {
        const s = shapeSize(f)
        const practice = f.properties?.practice as string | undefined
        if (!practice) untaggedShapes++
        const r = row(practice)
        r.projects.add(p.id)
        if (s.kind === 'area') {
          const a = s.sqm / SQ_M_PER_ACRE
          r.acres += a
          acres += a
          areas++
        } else if (s.kind === 'line') {
          const ft = s.m / M_PER_FT
          r.feet += ft
          feet += ft
          lines++
        } else if (s.kind === 'point') r.points++
      }
    }
    let sed = 0, pl = 0, nl = 0, noSed = 0
    for (const l of loads) {
      const r = row(l.practice_type)
      r.projects.add(l.project_id)
      r.sed += l.sediment_tons ?? 0
      r.p += l.phosphorus_lb ?? 0
      r.n += l.nitrogen_lb ?? 0
      r.entries++
      sed += l.sediment_tons ?? 0
      pl += l.phosphorus_lb ?? 0
      nl += l.nitrogen_lb ?? 0
      if (l.sediment_tons == null) noSed++
    }
    const order = new Map(types.map((t, i) => [t.id, i]))
    const typeRows = [...rows.values()].sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9))
    return {
      acres, feet, areas, lines, untaggedShapes, typeRows,
      sed, pl, nl, noSed,
      loadProjects: new Set(loads.map((l) => l.project_id)).size,
      untaggedLoads: loads.filter((l) => !l.practice_type || !known.has(l.practice_type)).length,
    }
  }, [list, loads, types])

  const watersheds = useMemo(() => {
    const m = new Map<string, { code: string; name: string | null; huc8: string | null; n: number }>()
    let none = 0
    for (const p of list) {
      if (!p.huc10) {
        none++
        continue
      }
      const w = m.get(p.huc10) ?? { code: p.huc10, name: p.huc10_name, huc8: p.huc8, n: 0 }
      w.n++
      m.set(p.huc10, w)
    }
    const rows = [...m.values()].sort((a, b) => b.n - a.n || (a.name ?? '').localeCompare(b.name ?? ''))
    return { rows, none, huc8s: new Set(rows.map((r) => r.huc8).filter(Boolean)).size }
  }, [list])

  const underway = list.filter((p) => UNDERWAY.has(p.stage)).length

  /** Data gaps staff can fix today, each with a link. */
  const attention = useMemo(() => {
    const items: { key: string; title: string; detail: string; to: string }[] = []
    const noPin = list.filter((p) => p.latitude == null || p.longitude == null)
    const noHuc = list.filter((p) => p.latitude != null && p.longitude != null && !p.huc10)
    const withType = new Set<string>()
    for (const p of list) for (const f of p.map_shapes?.features ?? []) if (f.properties?.practice) withType.add(p.id)
    for (const l of loads) if (l.practice_type) withType.add(l.project_id)
    const noType = list.filter((p) => !withType.has(p.id))
    const one = (ps: Project[]) => (ps.length === 1 ? `/projects/${ps[0].id}` : '/projects')
    const names = (ps: Project[]) => ps.slice(0, 3).map((p) => p.name).join(', ') + (ps.length > 3 ? ` and ${ps.length - 3} more` : '')
    if (noPin.length)
      items.push({ key: 'pin', title: `${noPin.length} ${noPin.length === 1 ? 'project has' : 'projects have'} no map pin`, detail: names(noPin), to: one(noPin) })
    if (noHuc.length)
      items.push({ key: 'huc', title: `${noHuc.length} ${noHuc.length === 1 ? 'project has' : 'projects have'} no watershed yet`, detail: 'Use "Look up watersheds" on the Projects list.', to: '/projects' })
    if (noType.length)
      items.push({ key: 'type', title: `${noType.length} ${noType.length === 1 ? 'project has' : 'projects have'} no practice type`, detail: `Draw and tag shapes on the Map tab, or tag load model entries. ${names(noType)}`, to: one(noType) })
    if (stats.untaggedShapes)
      items.push({ key: 'shape', title: `${stats.untaggedShapes} map ${stats.untaggedShapes === 1 ? 'shape has' : 'shapes have'} no practice`, detail: 'Their acres and feet count in the totals but not under any practice type.', to: '/map' })
    if (stats.untaggedLoads)
      items.push({ key: 'load', title: `${stats.untaggedLoads} load model ${stats.untaggedLoads === 1 ? 'entry has' : 'entries have'} no map practice type`, detail: 'Pick one on the project\'s Load model tab.', to: '/projects' })
    return items
  }, [list, loads, stats.untaggedShapes, stats.untaggedLoads])

  /** Newest changes: projects added or edited, load model imports (grouped per project and day). */
  const activity = useMemo(() => {
    const items: { key: string; when: string; what: string; detail: string; to: string }[] = []
    for (const p of list) {
      items.push({ key: `c${p.id}`, when: p.created_at, what: 'Project added', detail: p.name, to: `/projects/${p.id}` })
      if (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 60_000)
        items.push({ key: `u${p.id}`, when: p.updated_at, what: 'Project updated', detail: p.name, to: `/projects/${p.id}` })
    }
    const imports = new Map<string, { when: string; n: number; project: string }>()
    for (const l of loads) {
      const k = `${l.project_id}:${l.created_at.slice(0, 10)}`
      const g = imports.get(k) ?? { when: l.created_at, n: 0, project: l.project_id }
      g.n++
      if (l.created_at > g.when) g.when = l.created_at
      imports.set(k, g)
    }
    for (const [k, g] of imports)
      items.push({
        key: `l${k}`,
        when: g.when,
        what: `Load model: ${g.n} ${g.n === 1 ? 'entry' : 'entries'} saved`,
        detail: byId.get(g.project)?.name ?? 'Project',
        to: `/projects/${g.project}`,
      })
    return items.sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, 8)
  }, [list, loads, byId])

  const m = METRICS[metric]
  const loadRows = stats.typeRows
    .filter((r) => r.entries > 0)
    .map((r) => ({ key: r.key, label: <><span className="swatch" style={{ background: r.color }} />{r.name}</>, title: r.name, value: metric === 'sed' ? r.sed : metric === 'p' ? r.p : r.n, color: r.color }))
    .sort((a, b) => b.value - a.value)

  if (error) return <p className="error">Couldn't load the overview: {error}</p>
  if (!projects) return <p className="muted">Loading…</p>

  return (
    <div className="overview">
      <div className="page-head ov-head">
        <div>
          <h1>Program overview</h1>
          <p className="muted ov-intro">
            Every project and practice in TWF's watersheds, rolled up from the project records. Funding figures join as that section is built.
          </p>
        </div>
        <span className="ov-chip">
          <span className="ov-dot" style={{ background: 'var(--twf-green)' }} />
          {list.length} {list.length === 1 ? 'project' : 'projects'} · {underway} underway
        </span>
      </div>

      {/* What's been done on the ground: from map shapes and load model entries */}
      <section className="ov-grid ov-four" aria-label="Impact">
        <Tile
          label="Acres mapped"
          value={smart(stats.acres)}
          unit="ac"
          sub={stats.areas ? `${stats.areas} ${stats.areas === 1 ? 'area' : 'areas'} drawn on project maps` : 'Draw areas on a project\'s Map tab'}
        />
        <Tile
          label="Linear practices"
          value={num(stats.feet)}
          unit="ft"
          sub={stats.lines ? `${num(stats.feet / FT_PER_MILE, 1)} miles across ${stats.lines} ${stats.lines === 1 ? 'line' : 'lines'} (streambank, ditch, buffer…)` : 'Draw lines on a project\'s Map tab'}
        />
        <Tile
          label="Watersheds reached"
          value={num(watersheds.rows.length)}
          unit={watersheds.rows.length === 1 ? 'HUC-10' : 'HUC-10s'}
          sub={`${watersheds.huc8s} HUC-8 ${watersheds.huc8s === 1 ? 'subbasin' : 'subbasins'}${watersheds.none ? ` · ${watersheds.none} ${watersheds.none === 1 ? 'project' : 'projects'} not looked up` : ''}`}
        />
        <Tile
          label="Sediment reduction"
          value={smart(stats.sed)}
          unit="tons/yr"
          sub={loads.length ? `${smart(stats.pl)} lb P · ${smart(stats.nl)} lb N per year · Region 5 workbooks on ${stats.loadProjects} ${stats.loadProjects === 1 ? 'project' : 'projects'}` : 'Import a Region 5 workbook on a project\'s Load model tab'}
        />
      </section>

      {/* Money: nothing to show until Funding is built */}
      <section className="ov-grid ov-money" aria-label="Funding">
        <PendingTile hero label="Total committed to watershed work, program to date" needs="Budgets, expenditures and partners arrive with the Funding section." />
        <PendingTile label="Grant funds drawn" needs="Share of each award drawn so far (§319, LARE, TWF funds)." />
        <PendingTile label="Match secured" needs="Match secured against what each grant requires." />
        <PendingTile label="Unspent before expiry" needs="Money at risk and the next award to expire." />
      </section>

      <section className="ov-grid ov-two" aria-label="Charts">
        <div className="card ov-card">
          <div className="ov-card-head">
            <h2>Expenditure by quarter and practice</h2>
            <span className="ov-soon">Not tracked yet</span>
          </div>
          <div className="ov-chart-ghost" aria-hidden="true">
            {[38, 30, 56, 44].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
          <p className="ov-note">
            Quarterly spending, stacked by practice type, appears here once invoices and expenditures are entered in Funding.
          </p>
        </div>

        <div className="card ov-card">
          <div className="ov-card-head">
            <h2>Modeled load reduction by practice type</h2>
            <span className="muted small">program to date · {m.unit}</span>
          </div>
          <div className="pill-row" role="group" aria-label="Pollutant">
            {(Object.keys(METRICS) as Metric[]).map((k) => (
              <button key={k} className={`pill${metric === k ? ' on' : ''}`} aria-pressed={metric === k} onClick={() => setMetric(k)}>
                {METRICS[k].label}
              </button>
            ))}
          </div>
          <HBars
            rows={loadRows}
            fmt={(v) => `${smart(v)}`}
            empty={<>No load model results yet. Import a Region 5 workbook on a project's <strong>Load model</strong> tab.</>}
          />
          <p className="ov-note">
            Sums of the Region 5 workbook results saved on each project. One pollutant at a time, since sediment (tons) and
            phosphorus and nitrogen (lb) are different scales.
            {metric === 'sed' && stats.noSed > 0 && ` ${stats.noSed} feedlot ${stats.noSed === 1 ? 'entry has' : 'entries have'} no sediment figure.`}{' '}
            A cumulative line over time comes once projects carry install dates.
          </p>
        </div>
      </section>

      <section className="card ov-card ov-types" aria-label="By practice type">
        <div className="ov-card-head">
          <h2>By practice type</h2>
          <Link to="/map" className="small">Open the map</Link>
        </div>
        {stats.typeRows.length === 0 ? (
          <div className="ov-empty">No practices yet. Tag shapes on a project's Map tab with a practice type and they're totalled here.</div>
        ) : (
          <div className="ov-table-scroll">
            <table className="list ov-table">
              <thead>
                <tr>
                  <th>Practice type</th>
                  <th className="num">Projects</th>
                  <th className="num">Acres</th>
                  <th className="num">Feet</th>
                  <th className="num">Sediment t/yr</th>
                  <th className="num">P lb/yr</th>
                  <th className="num">N lb/yr</th>
                </tr>
              </thead>
              <tbody>
                {stats.typeRows.map((r) => (
                  <tr key={r.key}>
                    <td><span className="type-tag"><span className="swatch" style={{ background: r.color }} />{r.name}</span></td>
                    <td className="num mono">{r.projects.size}</td>
                    <td className="num mono">{r.acres ? smart(r.acres) : '—'}</td>
                    <td className="num mono">{r.feet ? num(r.feet) : '—'}</td>
                    <td className="num mono">{r.entries ? smart(r.sed) : '—'}</td>
                    <td className="num mono">{r.entries ? smart(r.p) : '—'}</td>
                    <td className="num mono">{r.entries ? smart(r.n) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ov-note">
          Acres and feet are measured from the shapes drawn on each project's Map tab. A project counts under every practice type it has.
        </p>
      </section>

      <section className="ov-grid ov-two" aria-label="Projects">
        <div className="card ov-card">
          <div className="ov-card-head">
            <h2>Projects by watershed</h2>
            <span className="muted small">HUC-10</span>
          </div>
          <HBars
            rows={[
              ...watersheds.rows.map((w) => ({ key: w.code, label: w.name ?? w.code, title: hucLabel(w.name, w.code), value: w.n })),
              ...(watersheds.none ? [{ key: 'none', label: <span className="muted">No watershed yet</span>, title: 'No watershed yet', value: watersheds.none, color: 'var(--border)' }] : []),
            ]}
            fmt={(v) => num(v)}
            empty="No projects yet."
          />
          <p className="ov-note">Committed dollars per watershed join this card once Funding is built.</p>
        </div>
        <div className="card ov-card">
          <div className="ov-card-head">
            <h2>Project pipeline</h2>
            <span className="muted small">{list.length} total</span>
          </div>
          <HBars
            rows={STAGES.map((s) => ({ key: s.id, label: s.name, title: s.name, value: list.filter((p) => p.stage === s.id).length }))}
            fmt={(v) => num(v)}
            empty={<>No projects yet. <Link to="/projects/new">Add the first one</Link>.</>}
          />
          <p className="ov-note">Every project moves through the same seven stages; change a project's stage on its page.</p>
        </div>
      </section>

      <section className="ov-grid ov-two" aria-label="Lists">
        <div className="card ov-card">
          <div className="ov-card-head">
            <h2>Needs attention</h2>
            <span className="muted small">data to fill in</span>
          </div>
          {attention.length === 0 ? (
            <div className="ov-empty">Nothing missing. Every project has a pin, a watershed and a practice type.</div>
          ) : (
            <ul className="ov-rows">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link to={a.to}>
                    <span className="ov-row-title">{a.title}</span>
                    <span className="ov-row-detail">{a.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="ov-note">Grant deadlines, reporting windows and expiring insurance join this list as Funding and Contractors are built.</p>
        </div>
        <div className="card ov-card">
          <div className="ov-card-head">
            <h2>Recent activity</h2>
            <span className="muted small">projects and load model</span>
          </div>
          {activity.length === 0 ? (
            <div className="ov-empty">No activity yet.</div>
          ) : (
            <ul className="ov-rows">
              {activity.map((a) => (
                <li key={a.key}>
                  <Link to={a.to}>
                    <span className="ov-row-title">{a.what}</span>
                    <span className="ov-row-detail">{a.detail}</span>
                  </Link>
                  <span className="ov-row-when muted small">{ago(a.when)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
