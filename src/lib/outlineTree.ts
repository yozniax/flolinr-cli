import type { OutlineNode } from '../types.js'

export function siblingsOf(
  nodes: OutlineNode[],
  parentId: string | null,
): OutlineNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

export function reindexSiblings(
  nodes: OutlineNode[],
  parentId: string | null,
): OutlineNode[] {
  const siblings = siblingsOf(nodes, parentId)
  const orderMap = new Map(siblings.map((n, i) => [n.id, i]))
  return nodes.map((n) =>
    n.parentId === parentId && orderMap.has(n.id)
      ? { ...n, order: orderMap.get(n.id)! }
      : n,
  )
}

export function getChildren(nodes: OutlineNode[], id: string): OutlineNode[] {
  return siblingsOf(nodes, id)
}

export function hasChildren(nodes: OutlineNode[], id: string): boolean {
  return nodes.some((n) => n.parentId === id)
}

/** Depth-first visible nodes (respecting collapsed). */
export function flattenVisible(nodes: OutlineNode[]): OutlineNode[] {
  const result: OutlineNode[] = []

  function walk(parentId: string | null) {
    for (const node of siblingsOf(nodes, parentId)) {
      result.push(node)
      if (!node.collapsed && hasChildren(nodes, node.id)) {
        walk(node.id)
      }
    }
  }

  walk(null)
  return result
}

export function getDepth(nodes: OutlineNode[], id: string): number {
  let depth = 0
  let current = nodes.find((n) => n.id === id)
  const guard = new Set<string>()
  while (current?.parentId) {
    if (guard.has(current.id)) break
    guard.add(current.id)
    depth += 1
    current = nodes.find((n) => n.id === current!.parentId)
  }
  return depth
}

export function collectDescendantIds(
  nodes: OutlineNode[],
  id: string,
): Set<string> {
  const ids = new Set<string>()
  function walk(parentId: string) {
    for (const child of getChildren(nodes, parentId)) {
      ids.add(child.id)
      walk(child.id)
    }
  }
  walk(id)
  return ids
}

export function nextVisibleId(
  nodes: OutlineNode[],
  id: string | null,
): string | null {
  if (!id) {
    const first = siblingsOf(nodes, null)[0]
    return first?.id ?? null
  }
  const visible = flattenVisible(nodes)
  const idx = visible.findIndex((n) => n.id === id)
  if (idx < 0) return visible[0]?.id ?? null
  return visible[idx + 1]?.id ?? null
}

export function prevVisibleId(
  nodes: OutlineNode[],
  id: string,
): string | null {
  const visible = flattenVisible(nodes)
  const idx = visible.findIndex((n) => n.id === id)
  if (idx <= 0) return null
  return visible[idx - 1]?.id ?? null
}
