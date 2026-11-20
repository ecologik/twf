import type { Role } from '../auth/context'

export type Section = {
  path: string
  label: string
  /** Who sees it. The database enforces this too; this is only for the menu. */
  roles: Role[]
  /** One line shown on the placeholder page until the real page is built. */
  blurb: string
}

/** Sections in the grey second row, in order. A divider goes before `Board`. */
export const SECTIONS: Section[] = [
  { path: '/projects', label: 'Projects', roles: ['admin'], blurb: 'Every practice from planning to close-out, with milestones, owners and site visits.' },
  { path: '/map', label: 'Map', roles: ['admin'], blurb: 'Every project\'s mapped practices on one map, filtered by practice type.' },
  { path: '/people', label: 'People', roles: ['admin'], blurb: 'Landowners, partners, contacts and the projects each one is on.' },
  { path: '/contractors', label: 'Contractors', roles: ['admin'], blurb: 'Companies, insurance expiry, invoicing and on-time record.' },
  { path: '/calculator', label: 'Calculator', roles: ['admin'], blurb: 'Load-reduction estimates for planned practices.' },
  { path: '/funding', label: 'Funding', roles: ['admin'], blurb: '§319, LARE and TWF funds: burn rate, match and reporting windows.' },
  { path: '/public', label: 'Public', roles: ['admin'], blurb: 'The public map: projects marked "Show on public site", open to everyone without signing in.' },
  { path: '/board', label: 'Board', roles: ['admin', 'board'], blurb: 'Project rundown and donor sheets.' },
]
