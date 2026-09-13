import type { OutlineNode } from '../types.js'

export function siblingsOf(
  nodes: OutlineNode[],
  parentId: string | null,
): OutlineNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

export function getChildren(nodes: OutlineNode[], id: string): OutlineNode[] {
  return siblingsOf(nodes, id)
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
