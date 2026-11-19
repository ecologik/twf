import { useEffect, useRef, useState } from 'react'
import MapPicker, { type LatLng } from './MapPicker'

/**
 * Pop-up with the click-to-pin map. Render it only while it should be open.
 * Changes stay in the pop-up until "Use this location"; Cancel, Esc or a
 * click outside leaves the form as it was.
 */
export default function LocationDialog({
  value,
  title = 'Set location',
  onClose,
  onSave,
}: {
  value: LatLng | null
  title?: string
  onClose: () => void
  onSave: (p: LatLng | null) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<LatLng | null>(value)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="location-dialog"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // click on the backdrop
    >
      <div className="location-dialog-body">
        <div className="location-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <MapPicker value={draft} onChange={setDraft} />
        <p className="muted small">
          Click the map to drop the pin, then drag it to fine-tune. The button in the corner switches between satellite and streets.
        </p>
        <div className="location-dialog-foot">
          <span className="muted small mono">
            {draft ? `${draft.lat.toFixed(6)}, ${draft.lng.toFixed(6)}` : 'No pin yet'}
          </span>
          <div className="form-actions">
            {draft && <button type="button" onClick={() => setDraft(null)}>Remove pin</button>}
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="button" className="primary" onClick={() => onSave(draft)}>Use this location</button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
