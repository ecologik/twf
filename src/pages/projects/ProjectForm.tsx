import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import LocationDialog from '../../map/LocationDialog'
import type { LatLng } from '../../map/MapPicker'
import PinIcon from '../../map/PinIcon'
import { hucLabel, lookupHuc, type HucInfo } from '../../map/huc'
import { pickDriveFolder, pickerConfigured } from '../../lib/googlePicker'
import { useAuth } from '../../auth/context'
import { driveFolderId, driveFolderUrl } from './drive'
import MapTab from './MapTab'
import LoadModelTab from './LoadModelTab'
import type { FeatureCollection } from 'geojson'
import ProjectTabs, { PROJECT_TABS, TabPlaceholder, type TabKey } from './ProjectTabs'
import { PROJECT_COLUMNS, type Project } from './types'

/** A number from a text box, or null if it is empty or not a number. */
function parseCoord(s: string): number | null {
  const n = Number(s.trim())
  return s.trim() === '' || !Number.isFinite(n) ? null : n
}

function wordCount(s: string): number {
  const t = s.trim()
  return t ? t.split(/\s+/).length : 0
}

export default function ProjectForm() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()

  const [loaded, setLoaded] = useState(isNew)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [savedName, setSavedName] = useState('')
  const [driveLink, setDriveLink] = useState('')
  const [driveName, setDriveName] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [driveError, setDriveError] = useState<string | null>(null)
  const { profile } = useAuth()
  const [mapShapes, setMapShapes] = useState<FeatureCollection | null>(null)
  const [loadCount, setLoadCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  // The pin's HUC-10 watershed, and which pin ("lat,lng") it was looked up for.
  const [huc, setHuc] = useState<HucInfo | null>(null)
  const [hucFor, setHucFor] = useState<string | null>(null)
  const [hucState, setHucState] = useState<'idle' | 'looking' | 'error'>('idle')
  const hucLookup = useRef<{ key: string; promise: Promise<HucInfo | null> } | null>(null)
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: TabKey = PROJECT_TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'overview'
  const setTab = (t: TabKey) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })

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
          setSavedName(p.name)
          setMapShapes(p.map_shapes)
          setDriveLink(p.drive_folder_id ? driveFolderUrl(p.drive_folder_id) : '')
          setLocation(p.location ?? '')
          setDescription(p.description ?? '')
          setLat(p.latitude?.toString() ?? '')
          setLng(p.longitude?.toString() ?? '')
          if (p.huc10 && p.latitude != null && p.longitude != null) {
            setHuc({ huc10: p.huc10, huc10_name: p.huc10_name, huc8_name: p.huc8_name })
            setHucFor(`${p.latitude},${p.longitude}`)
          }
        }
        setLoaded(true)
      })
  }, [id, isNew])

  const latN = parseCoord(lat)
  const lngN = parseCoord(lng)
  const pin: LatLng | null =
    latN != null && lngN != null && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180 ? { lat: latN, lng: lngN } : null

  const pinKey = pin ? `${pin.lat},${pin.lng}` : ''

  /** Looks up the pin's watershed once per pin, sharing a lookup already under way. */
  const findHuc = useCallback((p: LatLng): Promise<HucInfo | null> => {
    const key = `${p.lat},${p.lng}`
    if (hucLookup.current?.key === key) return hucLookup.current.promise
    setHucState('looking')
    const promise = lookupHuc(p.lat, p.lng).then(
      (h) => {
        if (hucLookup.current?.key === key) {
          setHuc(h)
          setHucFor(key)
          setHucState('idle')
        }
        return h
      },
      (e) => {
        if (hucLookup.current?.key === key) {
          setHucState('error')
          hucLookup.current = null
        }
        throw e
      },
    )
    hucLookup.current = { key, promise }
    return promise
  }, [])

  // A new or moved pin (or an old project without a watershed yet) gets its
  // watershed looked up shortly after the coordinates stop changing.
  useEffect(() => {
    if (!loaded || !pin || hucFor === pinKey) return
    const t = setTimeout(() => findHuc(pin).catch(() => {}), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, pinKey, hucFor, findHuc])

  const folderId = driveFolderId(driveLink)

  async function browseDrive() {
    setDriveError(null)
    setBrowsing(true)
    try {
      const f = await pickDriveFolder(profile?.email)
      if (f) {
        setDriveLink(driveFolderUrl(f.id))
        setDriveName(f.name)
      }
    } catch (e) {
      setDriveError(e instanceof Error ? e.message : String(e))
    }
    setBrowsing(false)
  }

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
    if (driveLink.trim() && !folderId) return setError("That doesn't look like a Google Drive folder link.")

    setBusy(true)
    // Make sure the watershed matches the pin being saved. If USGS can't be
    // reached, save without one; it is looked up again next time the project opens.
    let h: HucInfo | null = null
    if (pin) {
      if (hucFor === pinKey) h = huc
      else h = await findHuc(pin).catch(() => null)
    }
    const row = {
      name: name.trim(),
      location: location.trim() || null,
      description: description.trim() || null,
      drive_folder_id: folderId,
      latitude: pin?.lat ?? null,
      longitude: pin?.lng ?? null,
      huc10: h?.huc10 ?? null,
      huc10_name: h?.huc10_name ?? null,
      huc8_name: h?.huc8_name ?? null,
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

      {/* A new project gets the other tabs once it has been saved. */}
      {!isNew && <ProjectTabs active={tab} onChange={setTab} counts={{ map: mapShapes?.features.length || undefined, load: loadCount || undefined }} />}

      {tab === 'map' && id ? (
        <MapTab
          projectId={id}
          projectName={savedName || name}
          center={pin ? [pin.lat, pin.lng] : null}
          initial={mapShapes}
          huc10={hucFor === pinKey ? huc?.huc10 ?? null : null}
          onSaved={setMapShapes}
        />
      ) : tab === 'load' && id ? (
        <LoadModelTab projectId={id} onCount={setLoadCount} />
      ) : tab !== 'overview' ? (
        <TabPlaceholder tab={tab} />
      ) : (
        <form className="project-overview" onSubmit={save}>
          <div className="stack">
            <section className="card cover-card">
              <h2 className="card-title">Cover image</h2>
              <div className="cover-empty">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="9" cy="10" r="2" />
                  <path d="m21 16-5-5-9 9" />
                </svg>
                <strong>No cover yet</strong>
                <p className="muted small">Pick an image from this project's Drive folder, or upload a new one. Coming soon.</p>
                <div className="form-actions">
                  <button type="button" className="primary" disabled>Choose from Drive</button>
                  <button type="button" disabled>Upload</button>
                </div>
              </div>
            </section>
            <section className="card drive-card">
              <h2 className="card-title">Google Drive folder</h2>
              <label>
                <span className="muted small">
                  {pickerConfigured ? 'Browse to the folder, or paste its link.' : "Paste the link to this project's folder in Drive."}
                </span>
                <input
                  value={driveLink}
                  onChange={(e) => {
                    setDriveLink(e.target.value)
                    setDriveName(null)
                  }}
                  placeholder="https://drive.google.com/drive/folders/…"
                  aria-invalid={!!driveLink.trim() && !folderId}
                />
              </label>
              {pickerConfigured && (
                <button type="button" className="drive-browse" onClick={browseDrive} disabled={browsing}>
                  {browsing ? 'Opening Drive…' : 'Browse Drive…'}
                </button>
              )}
              {driveError && <p className="error small">{driveError}</p>}
              {driveLink.trim() && !folderId && <p className="error small">That doesn't look like a Drive folder link.</p>}
              {folderId && (
                <a className="small" href={driveFolderUrl(folderId)} target="_blank" rel="noreferrer">
                  {driveName ? `Open “${driveName}” in Drive ↗` : 'Open in Drive ↗'}
                </a>
              )}
            </section>
          </div>

          <div className="stack">
            <section className="card stack">
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
              <div className="huc-line">
                <span className="muted small">Watershed (HUC-10)</span>
                {!pin ? (
                  <span className="muted small">Set the location to find its watershed.</span>
                ) : hucState === 'looking' ? (
                  <span className="muted small">Looking it up…</span>
                ) : hucState === 'error' && hucFor !== pinKey ? (
                  <span className="small">
                    <span className="error">Couldn't reach the USGS watershed service.</span>{' '}
                    <button type="button" className="link" onClick={() => findHuc(pin).catch(() => {})}>
                      Try again
                    </button>
                  </span>
                ) : hucFor === pinKey && huc ? (
                  <span className="small">
                    <strong>{hucLabel(huc.huc10_name, huc.huc10)}</strong>
                    {huc.huc8_name && <span className="muted"> in {hucLabel(huc.huc8_name, huc.huc10.slice(0, 8))}</span>}
                  </span>
                ) : hucFor === pinKey ? (
                  <span className="muted small">The pin is outside the US watershed map.</span>
                ) : (
                  <span className="muted small">…</span>
                )}
              </div>
            </section>

            <section className="card field">
              <div className="field-head">
                <label htmlFor="project-description">
                  Description <span className="muted small">plain language, written once</span>
                </label>
                <span className="muted small">{wordCount(description)} {wordCount(description) === 1 ? 'word' : 'words'}</span>
              </div>
              <textarea
                id="project-description"
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="muted small field-help">
                Used in the report package narrative and on the public project page, so it is worth writing for somebody
                outside the office.
              </p>
            </section>

            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <button type="submit" className="primary" disabled={busy}>{isNew ? 'Add project' : 'Save'}</button>
              <button type="button" onClick={() => navigate('/projects')} disabled={busy}>Cancel</button>
              {!isNew && <button type="button" className="danger" onClick={remove} disabled={busy}>Delete</button>}
            </div>
          </div>
        </form>
      )}

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
