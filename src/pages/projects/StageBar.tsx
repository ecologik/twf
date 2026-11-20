import { STAGES, stepOf } from './stages'

/** Seven little bars and the stage name, for the Projects table. */
export function StageCell({ stage }: { stage: string }) {
  const step = stepOf(stage)
  return (
    <span className="stage-cell">
      <span className="stage-mini" aria-hidden="true">
        {STAGES.map((s, i) => (
          <span key={s.id} className={i < step ? 'on' : ''} />
        ))}
      </span>
      <span>{STAGES[step - 1].name}</span>
    </span>
  )
}

/** The project page's stage rail: click a step to move the project there. */
export default function StageBar({
  stage,
  busy,
  error,
  onChange,
}: {
  stage: string
  busy?: boolean
  error?: string | null
  onChange: (id: string) => void
}) {
  const step = stepOf(stage)
  return (
    <section className="card stage-card">
      <div className="stage-head">
        <h2 className="card-title">Stage</h2>
        <span className="muted small">
          {step} of {STAGES.length} · click a step to move the project
        </span>
      </div>
      <div className="stage-track" role="group" aria-label="Project stage">
        {STAGES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`stage-seg ${i + 1 < step ? 'done' : i + 1 === step ? 'here' : 'todo'}`}
            aria-current={i + 1 === step ? 'step' : undefined}
            title={`Move to ${s.name}`}
            disabled={busy}
            onClick={() => i + 1 !== step && onChange(s.id)}
          >
            <span className="stage-fill" />
            <span className="stage-lab">{s.name}</span>
          </button>
        ))}
      </div>
      {error && <p className="error small">{error}</p>}
    </section>
  )
}
