import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import LocationDialog from '../../map/LocationDialog'
import type { LatLng } from '../../map/MapPicker'
import PinIcon from '../../map/PinIcon'
import { PROJECT_COLUMNS, type Project } from './types'

/** A number from a text box, or null if it is empty or not a number. */
function parseCoord(s: string): number | null {
  const n = Number(s.trim())
  return s.trim() === '' || !Number.isFinite(n) ? null : n
}

export default function ProjectForm() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()

  const [loaded, setLoaded] = useState(isNew)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (isNew) return
    supabase
      .from('projects')
      .select(PROJECT_COLUMNS)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (!data) setError('That project was not found.')
        else {
          const p = data as Project
          setName(p.name)
          setLocation(p.location ?? '')
          setLat(p.latitude?.toString() ?? '')
          setLng(p.longitude?.toString() ?? '')
        }
        setLoaded(true)
      })
  }, [id, isNew])

  const latN = parseCoord(lat)
  const lngN = parseCoord(lng)
  const pin: LatLng | null =
    latN != null && lngN != null && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180 ? { lat: latN, lng: lngN } : null

  const onPick = useCallback((p: LatLng | null) => {
    setLat(p ? String(p.lat) : '')
    setLng(p ? String(p.lng) : '')
    setPicking(false)
  }, [])

  function onLatChange(v: string) {
    // Pasting "41.32, -85.78" (as copied from Google Maps) fills both boxes.
    const parts = v.split(',')
    if (parts.length === 2 && parseCoord(parts[0]) != null && parseCoord(parts[1]) != null) {
      setLat(parts[0].trim())
      setLng(parts[1].trim())
    } else setLat(v)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Give the project a name.')
    if ((lat.trim() || lng.trim()) && !pin) return setError('Latitude and longitude need to be numbers, or both left empty.')

    setBusy(true)
    const row = {
      name: name.trim(),
      location: location.trim() || null,
      latitude: pin?.lat ?? null,
      longitude: pin?.lng ?? null,
    }
    const { error } = isNew
      ? await supabase.from('projects').insert(row)
      : await supabase.from('projects').update(row).eq('id', id)
    setBusy(false)
    if (error) setError(error.message)
    else navigate('/projects')
  }

  async function remove() {
    if (!id || !window.confirm(`Delete “${name}”? This can't be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from('projects').delete().eq('id', id)
    setBusy(false)
    if (error) setError(error.message)
    else navigate('/projects')
  }

  if (!loaded) return <p className="muted">Loading…</p>

  return (
    <>
      <p className="small"><Link to="/projects">← All projects</Link></p>
      <h1>{isNew ? 'New project' : name || 'Project'}</h1>

      <form className="project-form" onSubmit={save}>
        <div className="stack">
          <label>
            Project name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus={isNew} />
          </label>
          <label>
            Location
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Webster Lake, south tributary"
            />
          </label>
          <div className="coords">
            <label>
              Latitude
              <input value={lat} onChange={(e) => onLatChange(e.target.value)} inputMode="decimal" placeholder="41.32" />
            </label>
            <label>
              Longitude
              <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" placeholder="-85.78" />
            </label>
            <button
              type="button"
              className="icon-button pin-button"
              onClick={() => setPicking(true)}
              title="Pick the location on a map"
              aria-label="Pick the location on a map"
            >
              <PinIcon />
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" className="primary" disabled={busy}>{isNew ? 'Add project' : 'Save'}</button>
            <button type="button" onClick={() => navigate('/projects')} disabled={busy}>Cancel</button>
            {!isNew && <button type="button" className="danger" onClick={remove} disabled={busy}>Delete</button>}
          </div>
        </div>
      </form>

      {picking && (
        <LocationDialog
          value={pin}
          title={name.trim() ? `Location of ${name.trim()}` : 'Project location'}
          onClose={() => setPicking(false)}
          onSave={onPick}
        />
      )}
    </>
  )
}
