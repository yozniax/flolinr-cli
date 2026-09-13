import type { OutlineNode, Roll } from '../types.js'
import { flattenAllNodes, nodeSearchSources } from './hashtags.js'
import { displayLineText } from './lineMarkers.js'

export type SearchHit = {
  rollId: string
  rollName: string
  nodeId: string
  label: string
  snippet: string
  archived: boolean
}

function nodeSearchText(node: OutlineNode): string {
  return nodeSearchSources(node).join('\n')
}

function makeSnippet(haystack: string, query: string, radius = 48): string {
  const lower = haystack.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx < 0) {
    const flat = haystack.replace(/\s+/g, ' ').trim()
    return flat.length > radius * 2
      ? `${flat.slice(0, radius * 2)}…`
      : flat
  }
  const start = Math.max(0, idx - radius)
  const end = Math.min(haystack.length, idx + q.length + radius)
  const slice = haystack.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${slice}${end < haystack.length ? '…' : ''}`
}

export function searchWorkspace(
  rolls: Roll[],
  rawQuery: string,
): SearchHit[] {
  const query = rawQuery.trim()
  if (!query) return []
  const q = query.toLowerCase()
  const hits: SearchHit[] = []

  for (const roll of rolls) {
    for (const node of flattenAllNodes(roll.document.nodes)) {
      const haystack = nodeSearchText(node)
      if (!haystack.toLowerCase().includes(q)) continue
      const label =
        displayLineText(node.text).trim() ||
        (node.block
          ? node.block.kind === 'image' || node.block.kind === 'pdf'
            ? node.block.language?.trim() || node.block.kind
            : node.block.content
                .split('\n')
                .find((l) => l.trim())
                ?.trim() || node.block.kind
          : '(empty line)')
      hits.push({
        rollId: roll.id,
        rollName: roll.name,
        nodeId: node.id,
        label,
        snippet: makeSnippet(haystack, query),
        archived: roll.archived,
      })
    }
  }

  return hits
}
