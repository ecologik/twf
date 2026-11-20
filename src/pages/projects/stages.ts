/** A project's stages, in order (same as the prototype and the database check). */
export const STAGES = [
  { id: 'planning', name: 'Planning' },
  { id: 'design', name: 'Design & permits' },
  { id: 'contracted', name: 'Contracted' },
  { id: 'construction', name: 'Construction' },
  { id: 'installed', name: 'Installed' },
  { id: 'monitoring', name: 'Monitoring' },
  { id: 'closed', name: 'Closed out' },
] as const

export type StageId = (typeof STAGES)[number]['id']

/** 1-based step of a stage (Planning = 1), or 1 for anything unknown. */
export const stepOf = (id: string) => Math.max(1, STAGES.findIndex((s) => s.id === id) + 1)
export const stageName = (id: string) => STAGES.find((s) => s.id === id)?.name ?? id
