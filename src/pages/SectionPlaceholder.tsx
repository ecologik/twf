import type { Section } from '../nav/sections'

export default function SectionPlaceholder({ section }: { section: Section }) {
  return (
    <>
      <h1>{section.label}</h1>
      <p className="muted">{section.blurb}</p>
      <p className="muted small">Coming soon.</p>
    </>
  )
}
