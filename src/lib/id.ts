export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
