/** Kept for CSV schema compatibility; display size follows outline depth instead. */
export const DEFAULT_FONT_SCALE = 1

export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SCALE
  return DEFAULT_FONT_SCALE
}
