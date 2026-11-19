import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { R5_PRACTICES } from '../../loadModel/practices'
import { fmt, fmt1, PRACTICE_SHEET, SHEET_LABEL, type Detail, type LoadEntryDraft, type SheetKind } from '../../loadModel/labels'
import type { SkippedTab } from '../../loadModel/region5'
import { fromFile, WORKBOOK_SOURCES, type WorkbookFile } from '../../loadModel/sources'

type Entry = {
  id: string
  name: string
  sheet_kind: SheetKind
  practice: string | null
  life_years: number | null
  sediment_tons: number | null
  phosphorus_lb: number | null
  nitrogen_lb: number | null
  bod_lb: number | null
  details: Detail[]
  source_file: string | null
  source_sheet: string | null
}
const COLUMNS =
  'id, name, sheet_kind, practice, life_years, sediment_tons, phosphorus_lb, nitrogen_lb, bod_lb, details, source_file, source_sheet'

/** The fields staff can change before (and after) saving. */
type Editable = { name: string; practice: string | null; life: string }
type DraftRow = { draft: LoadEntryDraft; include: boolean; edit: Editable }
type Preview = { file: string; rows: DraftRow[]; skipped: SkippedTab[] }

const lifeNumber = (s: string): number | null => {
  const n = Number(s.trim())
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Results({ sed, p, n, big }: { sed: number | null; p: number | null; n: number | null; big?: boolean }) {
  return (
    <div className={big ? 'lm-results big' : 'lm-results'}>
      {(
        [
          ['Sediment', sed, 'ton/yr'],
          ['Phosphorus', p, 'lb/yr'],
          ['Nitrogen', n, 'lb/yr'],
        ] as const
      ).map(([label, v, unit]) => (
        <div key={label}>
          <div className="muted small">{label}</div>
          <div className="lm-value">{v == null ? <span className="muted small">not in workbook</span> : fmt1(v)}</div>
          <div className="muted lm-unit">{unit}</div>
        </div>
      ))}
    </div>
  )
}

function Details({ rows, bod }: { rows: Detail[]; bod: number | null }) {
  const all: Detail[] = bod != null ? [...rows, ['BOD reduction', `${fmt(bod)} lb/yr`]] : rows
  return (
    <dl className="lm-details">
      {all.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function PracticeFields({ kind, value, onChange }: { kind: SheetKind; value: Editable; onChange: (v: Editable) => void }) {
  const sheet = PRACTICE_SHEET[kind]
  const options = R5_PRACTICES.filter((p) => p.sheet === sheet)
  return (
    <div className="lm-edit">
      <label>
        Name
        <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </label>
      <label>
        Practice
        <select
          value={value.practice ?? ''}
          onChange={(e) => {
            const name = e.target.value || null
            const p = R5_PRACTICES.find((x) => x.name === name)
            onChange({ ...value, practice: name, life: p?.life != null ? String(p.life) : value.life })
          }}
        >
          <option value="">{options.length ? '— Pick a practice —' : '— None —'}</option>
          {options.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
          {value.practice && !options.some((p) => p.name === value.practice) && (
            <option value={value.practice}>{value.practice}</option>
          )}
        </select>
      </label>
      <label className="lm-life">
        Life span (years)
        <input inputMode="decimal" value={value.life} onChange={(e) => onChange({ ...value, life: e.target.value })} />
      </label>
    </div>
  )
}

function CardHead({ name, kind, practice, life }: { name: string; kind: SheetKind; practice: string | null; life: number | null }) {
  return (
    <div className="lm-head">
      <div>
        <div className="lm-name">{name || 'Untitled'}</div>
        <div className="muted lm-sub">
          {SHEET_LABEL[kind]}
          {practice ? ` · ${practice}` : ''}
        </div>
      </div>
      {life != null && <span className="lm-chip">{fmt(life)}-yr life</span>}
    </div>
  )
}

function SumCard({ entries }: { entries: Entry[] }) {
  const sum = (k: 'sediment_tons' | 'phosphorus_lb' | 'nitrogen_lb') =>
    entries.some((e) => e[k] != null) ? entries.reduce((a, e) => a + (e[k] ?? 0), 0) : null
  const life = (k: 'sediment_tons' | 'phosphorus_lb' | 'nitrogen_lb') =>
    entries.reduce((a, e) => a + (e[k] ?? 0) * (e.life_years ?? 0), 0)
  const noSediment = entries.filter((e) => e.sediment_tons == null)
  const noLife = entries.filter((e) => e.life_years == null)
  return (
    <section className="lm-card lm-sum">
      <div className="lm-sum-title">✓ Sum of {entries.length} calculations</div>
      <Results sed={sum('sediment_tons')} p={sum('phosphorus_lb')} n={sum('nitrogen_lb')} big />
      {noLife.length === 0 ? (
        <p className="muted small lm-note">
          Over each practice's own life: {fmt(Math.round(life('sediment_tons')))} tons sediment,{' '}
          {fmt(Math.round(life('phosphorus_lb')))} lb P, {fmt(Math.round(life('nitrogen_lb')))} lb N. Summed per
          practice, because a 1-year cover crop and a 20-year bank can't share a multiplier.
        </p>
      ) : (
        <p className="muted small lm-note">
          Lifetime totals show once every entry has a life span. Missing: {noLife.map((e) => e.name).join(', ')}.
        </p>
      )}
      {noSediment.length > 0 && noSediment.length < entries.length && (
        <p className="muted small lm-note">
          The sediment total leaves out {noSediment.map((e) => e.name).join(', ')}, which the workbook gives no sediment
          figure for.
        </p>
      )}
    </section>
  )
}

function SavedCard({ entry, onRemove, onSaved }: { entry: Entry; onRemove: () => void; onSaved: (e: Entry) => void }) {
  const [editing, setEditing] = useState<Editable | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!editing) return
    if (!editing.name.trim()) return setError('Give it a name.')
    setBusy(true)
    const patch = { name: editing.name.trim(), practice: editing.practice, life_years: lifeNumber(editing.life) }
    const { error } = await supabase.from('load_model_entries').update(patch).eq('id', entry.id)
    setBusy(false)
    if (error) return setError(error.message)
    setEditing(null)
    setError(null)
    onSaved({ ...entry, ...patch })
  }

  return (
    <section className="lm-card">
      <CardHead name={entry.name} kind={entry.sheet_kind} practice={entry.practice} life={entry.life_years} />
      <Results sed={entry.sediment_tons} p={entry.phosphorus_lb} n={entry.nitrogen_lb} />
      <Details rows={entry.details} bod={entry.bod_lb} />
      {entry.source_file && (
        <p className="muted small lm-note">
          From {entry.source_file}
          {entry.source_sheet ? `, ${entry.source_sheet.trim()} tab` : ''}
        </p>
      )}
      {editing && <PracticeFields kind={entry.sheet_kind} value={editing} onChange={setEditing} />}
      {error && <p className="error small">{error}</p>}
      <div className="form-actions lm-actions">
        {editing ? (
          <>
            <button type="button" className="primary" onClick={save} disabled={busy}>Save</button>
            <button type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                setEditing({ name: entry.name, practice: entry.practice, life: entry.life_years?.toString() ?? '' })
              }
            >
              Edit
            </button>
            <button type="button" onClick={onRemove}>Remove</button>
          </>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export default function LoadModelTab({ projectId, onCount }: { projectId: string; onCount?: (n: number) => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    supabase
      .from('load_model_entries')
      .select(COLUMNS)
      .eq('project_id', projectId)
      .order('created_at')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setEntries((data ?? []) as Entry[])
      })
  }, [projectId])

  useEffect(() => {
    if (entries) onCount?.(entries.length)
  }, [entries, onCount])

  const openWorkbook = useCallback(async (file: WorkbookFile) => {
    setError(null)
    setBusy(true)
    try {
      // The reader is loaded only when someone imports a workbook.
      const { readRegion5 } = await import('../../loadModel/region5')
      const result = readRegion5(file.data)
      setPreview({
        file: file.name,
        skipped: result.skipped,
        rows: result.entries.map((d) => ({
          draft: d,
          include: true,
          edit: { name: d.name, practice: d.practice, life: d.life_years?.toString() ?? '' },
        })),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }, [])

  async function pickFrom(source: (typeof WORKBOOK_SOURCES)[number]) {
    try {
      const f = await source.pick()
      if (f) await openWorkbook(f)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    try {
      await openWorkbook(await fromFile(f))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const setRow = (i: number, row: Partial<DraftRow>) =>
    setPreview((p) => p && { ...p, rows: p.rows.map((r, k) => (k === i ? { ...r, ...row } : r)) })

  async function saveImport() {
    if (!preview) return
    const chosen = preview.rows.filter((r) => r.include)
    if (chosen.some((r) => !r.edit.name.trim())) return setError('Every entry you keep needs a name.')
    setBusy(true)
    setError(null)
    const rows = chosen.map(({ draft: d, edit }) => ({
      project_id: projectId,
      name: edit.name.trim(),
      sheet_kind: d.sheet_kind,
      practice: edit.practice,
      life_years: lifeNumber(edit.life),
      sediment_tons: d.sediment_tons,
      phosphorus_lb: d.phosphorus_lb,
      nitrogen_lb: d.nitrogen_lb,
      bod_lb: d.bod_lb,
      details: d.details,
      inputs: d.inputs,
      source_file: preview.file,
      source_sheet: d.source_sheet,
    }))
    const { data, error } = await supabase.from('load_model_entries').insert(rows).select(COLUMNS)
    setBusy(false)
    if (error) return setError(error.message)
    setEntries((list) => [...(list ?? []), ...((data ?? []) as Entry[])])
    setPreview(null)
  }

  async function remove(entry: Entry) {
    if (!window.confirm(`Remove “${entry.name}” from this project?`)) return
    const { error } = await supabase.from('load_model_entries').delete().eq('id', entry.id)
    if (error) return setError(error.message)
    setEntries((list) => (list ?? []).filter((e) => e.id !== entry.id))
  }

  if (!entries) return <p className="muted">Loading…</p>
  const keep = preview?.rows.filter((r) => r.include).length ?? 0

  return (
    <section className="card lm-tab">
      <div className="lm-title-row">
        <h2 className="card-title">Load reduction, Region 5 model</h2>
        <span className="muted small">
          {entries.length} {entries.length === 1 ? 'calculation' : 'calculations'}
        </span>
      </div>

      {preview ? (
        <div className="lm-preview">
          <p className="lm-preview-head">
            <strong>
              Found {preview.rows.length} {preview.rows.length === 1 ? 'BMP' : 'BMPs'} in {preview.file}.
            </strong>{' '}
            <span className="muted">Check the names and practices, untick anything you don't want, then save.</span>
          </p>
          {preview.rows.map((r, i) => (
            <section key={i} className={r.include ? 'lm-card' : 'lm-card lm-off'}>
              <label className="check lm-include">
                <input type="checkbox" checked={r.include} onChange={(e) => setRow(i, { include: e.target.checked })} />
                Import this one <span className="muted small">({r.draft.source_sheet.trim()} tab)</span>
              </label>
              <CardHead
                name={r.edit.name}
                kind={r.draft.sheet_kind}
                practice={r.edit.practice}
                life={lifeNumber(r.edit.life)}
              />
              <Results sed={r.draft.sediment_tons} p={r.draft.phosphorus_lb} n={r.draft.nitrogen_lb} />
              <Details rows={r.draft.details} bod={r.draft.bod_lb} />
              {r.draft.warnings.map((w) => (
                <p key={w} className="lm-warning small">⚠ {w}</p>
              ))}
              {r.include && <PracticeFields kind={r.draft.sheet_kind} value={r.edit} onChange={(edit) => setRow(i, { edit })} />}
            </section>
          ))}
          {preview.skipped.length > 0 && (
            <div className="muted small">
              Nothing imported from:
              <ul>
                {preview.skipped.map((s) => (
                  <li key={s.sheet}>
                    {s.sheet.trim()}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="primary" onClick={saveImport} disabled={busy || keep === 0}>
              {busy ? 'Saving…' : `Save ${keep} ${keep === 1 ? 'entry' : 'entries'}`}
            </button>
            <button type="button" onClick={() => setPreview(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div
            className={dragging ? 'lm-drop dragging' : 'lm-drop'}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <p className="small">
              Import results from a Region 5 load-reduction workbook (.xlsm). Every filled-in tab becomes an entry here.
              The numbers are the ones the workbook calculated; nothing is recalculated.
            </p>
            <div className="form-actions">
              {WORKBOOK_SOURCES.map((s) => (
                <button key={s.id} type="button" className="primary" onClick={() => pickFrom(s)} disabled={busy}>
                  {busy ? 'Reading…' : s.label}
                </button>
              ))}
              <span className="muted small">or drop the file here</span>
            </div>
          </div>
          {error && <p className="error">{error}</p>}

          {entries.length > 1 && <SumCard entries={entries} />}
          {entries.map((e) => (
            <SavedCard
              key={e.id}
              entry={e}
              onRemove={() => remove(e)}
              onSaved={(u) => setEntries((list) => (list ?? []).map((x) => (x.id === u.id ? u : x)))}
            />
          ))}
          {entries.length === 0 && <p className="muted small">No load reductions yet.</p>}
        </>
      )}
    </section>
  )
}
