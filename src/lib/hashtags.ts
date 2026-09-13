import type { OutlineNode, Roll } from '../types.js'
import { getChildren, siblingsOf } from './outlineTree.js'

export function extractHashtags(text: string): string[] {
  const tags: string[] = []
  const re = /#([\p{L}\p{N}_-]+)/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const tag = m[1]
    if (tag) tags.push(tag)
  }
  return tags
}

export function nodeSearchSources(node: OutlineNode): string[] {
  const parts = [node.text]
  const block = node.block
  if (block?.content && block.kind !== 'image' && block.kind !== 'pdf') {
    parts.push(block.content)
  } else if (block?.language && (block.kind === 'image' || block.kind === 'pdf')) {
    parts.push(block.language)
  }
  return parts
}

export function nodeHashtagSources(node: OutlineNode): string[] {
  const parts = [node.text]
  const block = node.block
  if (
    block?.content &&
    block.kind !== 'md' &&
    block.kind !== 'code' &&
    block.kind !== 'image' &&
    block.kind !== 'pdf'
  ) {
    parts.push(block.content)
  }
  return parts
}

export function nodeHasHashtag(node: OutlineNode, tag: string): boolean {
  const key = tag.toLowerCase()
  return nodeHashtagSources(node).some((text) =>
    extractHashtags(text).some((h) => h.toLowerCase() === key),
  )
}

export type HashtagStat = {
  tag: string
  count: number
}

function accumulateHashtagStats(
  nodes: OutlineNode[],
  map: Map<string, HashtagStat>,
) {
  for (const node of nodes) {
    const seenInNode = new Set<string>()
    for (const text of nodeHashtagSources(node)) {
      for (const raw of extractHashtags(text)) {
        const key = raw.toLowerCase()
        if (seenInNode.has(key)) continue
        seenInNode.add(key)
        const cur = map.get(key)
        if (cur) cur.count += 1
        else map.set(key, { tag: raw, count: 1 })
      }
    }
  }
}

export function collectHashtagStatsFromRolls(rolls: Roll[]): HashtagStat[] {
  const map = new Map<string, HashtagStat>()
  for (const roll of rolls) {
    accumulateHashtagStats(roll.document.nodes, map)
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ja'),
  )
}

export function flattenAllNodes(nodes: OutlineNode[]): OutlineNode[] {
  const result: OutlineNode[] = []
  function walk(parentId: string | null) {
    for (const node of siblingsOf(nodes, parentId)) {
      result.push(node)
      walk(node.id)
    }
  }
  walk(null)
  return result
}

export type HashtagListEntry = {
  node: OutlineNode
  depth: number
}

export type HashtagChunk = {
  rollId: string
  rollName: string
  rootId: string
  entries: HashtagListEntry[]
}

export function buildHashtagChunks(rolls: Roll[], tag: string): HashtagChunk[] {
  const chunks: HashtagChunk[] = []

  for (const roll of rolls) {
    const nodes = roll.document.nodes
    const taggedIds = new Set(
      nodes.filter((n) => nodeHasHashtag(n, tag)).map((n) => n.id),
    )
    if (taggedIds.size === 0) continue

    const byId = new Map(nodes.map((n) => [n.id, n]))

    function hasTaggedAncestor(id: string): boolean {
      let parentId = byId.get(id)?.parentId ?? null
      while (parentId) {
        if (taggedIds.has(parentId)) return true
        parentId = byId.get(parentId)?.parentId ?? null
      }
      return false
    }

    const roots = flattenAllNodes(nodes).filter(
      (n) => taggedIds.has(n.id) && !hasTaggedAncestor(n.id),
    )

    for (const root of roots) {
      const entries: HashtagListEntry[] = []
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
