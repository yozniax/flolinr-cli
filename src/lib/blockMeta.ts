import type { NodeBlock } from '../types.js'

export const BLOCK_KINDS = [
  'text',
  'code',
  'md',
  'todo',
  'quote',
  'image',
  'pdf',
] as const

export function isBlockKind(value: string): value is NodeBlock['kind'] {
  return (BLOCK_KINDS as readonly string[]).includes(value)
}
