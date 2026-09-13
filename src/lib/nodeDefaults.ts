import type { NodeBlock } from '../types.js'

export function defaultBlockName(
  kind: NodeBlock['kind'],
  language: string | null,
  content: string,
): string {
  if (language?.trim()) return language.trim()
  const first = content.split('\n').find((l) => l.trim())?.trim() ?? ''
  if (!first) {
    if (kind === 'code') return 'code'
    if (kind === 'md') return 'markdown'
    if (kind === 'todo') return 'todo'
    if (kind === 'quote') return 'quote'
    return 'text'
  }
  if (first.length <= 48) return first
  return `${first.slice(0, 48)}…`
}
