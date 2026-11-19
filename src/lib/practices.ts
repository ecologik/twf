import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type PracticeType = { id: string; name: string; color: string; sort_order: number }

/** Colour for shapes with no practice set (and for a practice that was deleted). */
export const UNSET_COLOR = '#f6c445'

let cache: Promise<PracticeType[]> | null = null

export function loadPracticeTypes(force = false): Promise<PracticeType[]> {
  if (!cache || force) {
    cache = Promise.resolve(
      supabase.from('practice_types').select('id, name, color, sort_order').order('sort_order').order('name'),
    ).then(({ data, error }) => {
      if (error) {
        cache = null
        throw error
      }
      return (data ?? []) as PracticeType[]
    })
  }
  return cache
}

/** The practice types, loaded once per page visit and shared between components. */
export function usePracticeTypes() {
  const [types, setTypes] = useState<PracticeType[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadPracticeTypes().then(
      (t) => live && setTypes(t),
      (e) => live && setError(e.message ?? String(e)),
    )
    return () => {
      live = false
    }
  }, [])
  return { types, error }
}

/** Turns a name into an id, e.g. "Grassed waterway" -> "grassed-waterway". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
