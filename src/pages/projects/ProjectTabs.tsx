export type TabKey = 'overview' | 'milestones' | 'load' | 'map' | 'funding' | 'people' | 'notes'

/** The tabs on a project's page, in order. `blurb` shows until the tab is built. */
export const PROJECT_TABS: { key: TabKey; label: string; blurb: string }[] = [
  { key: 'overview', label: 'Overview', blurb: '' },
  { key: 'milestones', label: 'Milestones', blurb: 'Milestones with owners and due dates, from planning to close-out.' },
  { key: 'load', label: 'Load model', blurb: "Load-reduction estimates for this project's practices." },
  { key: 'map', label: 'Map', blurb: '' },
  { key: 'funding', label: 'Funding', blurb: 'Which grants and funds pay for this project, and how much has been spent.' },
  { key: 'people', label: 'People', blurb: 'Landowners, partners and contractors on this project, and why each one is on it.' },
  { key: 'notes', label: 'Notes', blurb: 'Site visit notes and photos.' },
]

/**
 * Tab row. Pass `counts` once a tab has real data behind it; tabs without a
 * count show no badge.
 */
export default function ProjectTabs({
  active,
  onChange,
  counts = {},
}: {
  active: TabKey
  onChange: (t: TabKey) => void
  counts?: Partial<Record<TabKey, number>>
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Project sections">
      {PROJECT_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={active === t.key ? 'tab active' : 'tab'}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {counts[t.key] != null && <span className="tab-count">{counts[t.key]}</span>}
        </button>
      ))}
    </div>
  )
}

export function TabPlaceholder({ tab }: { tab: TabKey }) {
  const t = PROJECT_TABS.find((x) => x.key === tab)!
  // Map has its own component (MapTab); the rest show this until they're built.
  return (
    <section className="card tab-placeholder">
      <h2 className="card-title">{t.label}</h2>
      <p className="muted">{t.blurb}</p>
      <p className="muted small">Coming soon.</p>
    </section>
  )
}
