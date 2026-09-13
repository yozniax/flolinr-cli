import type { Roll } from '../types.js'

/** Ensure Roll names stay unique: Test → Test-1 → Test-2 … */
export function uniqueRollName(
  desired: string,
  rolls: readonly Roll[],
  options?: { excludeRollId?: string },
): string {
  const base = desired.trim() || 'Untitled'
  const taken = new Set(
    rolls.filter((r) => r.id !== options?.excludeRollId).map((r) => r.name),
  )
  if (!taken.has(base)) return base
  let n = 1
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}
