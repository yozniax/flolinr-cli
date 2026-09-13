import type { OutlineNode, Roll } from '../types.js'
import { toDayKey } from './calendar.js'
import { flattenAllNodes, type HashtagChunk } from './hashtags.js'
import { getChildren } from './outlineTree.js'

export type LogDayStat = {
  dayKey: string
  count: number
}

function nodeTouchesDay(node: OutlineNode, dayKey: string): boolean {
  const created = toDayKey(node.createdAt)
  const updated = toDayKey(node.updatedAt)
  return created === dayKey || updated === dayKey
}

export function parseLogDay(raw: string): string | null {
  const trimmed = raw.trim().replaceAll('/', '-')
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (!m) return null
  const y = Number(m[1])
  const month = Number(m[2])
  const d = Number(m[3])
  const parsed = new Date(y, month - 1, d)
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== d
  ) {
    return null
  }
  return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function collectLogDays(rolls: Roll[]): LogDayStat[] {
  const map = new Map<string, number>()
  for (const roll of rolls) {
    const seen = new Set<string>()
    for (const node of roll.document.nodes) {
      for (const iso of [node.createdAt, node.updatedAt]) {
        const key = toDayKey(iso)
        if (!key || seen.has(`${node.id}:${key}`)) continue
        seen.add(`${node.id}:${key}`)
        map.set(key, (map.get(key) ?? 0) + 1)
      }
    }
  }
  return [...map.entries()]
    .map(([dayKey, count]) => ({ dayKey, count }))
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
}

export function buildLogChunks(rolls: Roll[], dayKey: string): HashtagChunk[] {
  const chunks: HashtagChunk[] = []

  for (const roll of rolls) {
    const nodes = roll.document.nodes
    const matchIds = new Set(
      nodes.filter((n) => nodeTouchesDay(n, dayKey)).map((n) => n.id),
    )
    if (matchIds.size === 0) continue

    const byId = new Map(nodes.map((n) => [n.id, n]))

    function hasMatchingAncestor(id: string): boolean {
      let parentId = byId.get(id)?.parentId ?? null
      while (parentId) {
        if (matchIds.has(parentId)) return true
        parentId = byId.get(parentId)?.parentId ?? null
      }
      return false
    }

    const roots = flattenAllNodes(nodes).filter(
      (n) => matchIds.has(n.id) && !hasMatchingAncestor(n.id),
    )

    for (const root of roots) {
      const entries: HashtagChunk['entries'] = []
      function walk(id: string, depth: number) {
        const node = byId.get(id)
        if (!node) return
        entries.push({ node, depth })
        for (const child of getChildren(nodes, id)) {
          walk(child.id, depth + 1)
        }
      }
      walk(root.id, 0)
      chunks.push({
        rollId: roll.id,
        rollName: roll.name,
        rootId: root.id,
        entries,
      })
    }
  }

  return chunks
}
