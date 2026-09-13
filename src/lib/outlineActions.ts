import type { OutlineDocument, OutlineNode } from '../types.js'
import { DEFAULT_FONT_SCALE } from './fontScale.js'
import { createId } from './id.js'
import {
  flattenVisible,
  getChildren,
  nextVisibleId,
  reindexSiblings,
  siblingsOf,
} from './outlineTree.js'

function nowIso(): string {
  return new Date().toISOString()
}

function touch(node: OutlineNode, patch: Partial<OutlineNode>): OutlineNode {
  return { ...node, ...patch, updatedAt: nowIso() }
}

function withLastEdited(
  doc: OutlineDocument,
  lastEditedId: string | null,
): OutlineDocument {
  return { ...doc, meta: { ...doc.meta, lastEditedId } }
}

export type FocusHint = {
  focusId: string
  caret?: 'start' | 'end' | number
}

export type ActionResult = {
  doc: OutlineDocument
  focus?: FocusHint
}

export function setText(
  doc: OutlineDocument,
  id: string,
  text: string,
): ActionResult {
  const nodes = doc.nodes.map((n) => (n.id === id ? touch(n, { text }) : n))
  return { doc: withLastEdited({ ...doc, nodes }, id) }
}

export function toggleCollapse(
  doc: OutlineDocument,
  id: string,
): ActionResult {
  const nodes = doc.nodes.map((n) =>
    n.id === id ? { ...n, collapsed: !n.collapsed } : n,
  )
  return { doc: { ...doc, nodes } }
}

/** Enter: create sibling below current. */
export function insertSiblingBelow(
  doc: OutlineDocument,
  id: string,
  text = '',
): ActionResult {
  const current = doc.nodes.find((n) => n.id === id)
  if (!current) return { doc }

  const now = nowIso()
  const newId = createId()
  let nodes = doc.nodes.map((n) => {
    if (n.parentId === current.parentId && n.order > current.order) {
      return { ...n, order: n.order + 1 }
    }
    return n
  })

  nodes = [
    ...nodes,
    {
      id: newId,
      parentId: current.parentId,
      order: current.order + 1,
      text,
      createdAt: now,
      updatedAt: now,
      collapsed: false,
      bold: false,
      strike: false,
      underline: false,
      fontScale: DEFAULT_FONT_SCALE,
      block: null,
    },
  ]

  return {
    doc: withLastEdited({ ...doc, nodes }, id),
    focus: { focusId: newId, caret: text ? 'end' : 'start' },
  }
}

/** Tab: nest under previous sibling. */
export function indent(doc: OutlineDocument, id: string): ActionResult {
  const current = doc.nodes.find((n) => n.id === id)
  if (!current) return { doc }

  const siblings = siblingsOf(doc.nodes, current.parentId)
  const index = siblings.findIndex((n) => n.id === id)
  if (index <= 0) return { doc, focus: { focusId: id, caret: 'end' } }

  const newParent = siblings[index - 1]!
  let nodes = doc.nodes.map((n) =>
    n.id === id
      ? touch(n, {
          parentId: newParent.id,
          order: getChildren(doc.nodes, newParent.id).length,
        })
      : n,
  )
  nodes = reindexSiblings(nodes, current.parentId)
  nodes = reindexSiblings(nodes, newParent.id)
  nodes = nodes.map((n) =>
    n.id === newParent.id ? { ...n, collapsed: false } : n,
  )

  return {
    doc: withLastEdited({ ...doc, nodes }, id),
    focus: { focusId: id, caret: 'end' },
  }
}

/** Shift+Tab: lift to parent's level. */
export function outdent(doc: OutlineDocument, id: string): ActionResult {
  const current = doc.nodes.find((n) => n.id === id)
  if (!current?.parentId) return { doc, focus: { focusId: id, caret: 'end' } }

  const parent = doc.nodes.find((n) => n.id === current.parentId)
  if (!parent) return { doc }

  const oldParentId = current.parentId

  let nodes = doc.nodes.map((n) => {
    if (n.parentId === parent.parentId && n.order > parent.order) {
      return { ...n, order: n.order + 1 }
    }
    return n
  })

  nodes = nodes.map((n) =>
    n.id === id
      ? touch(n, { parentId: parent.parentId, order: parent.order + 1 })
      : n,
  )

  nodes = reindexSiblings(nodes, oldParentId)
  nodes = reindexSiblings(nodes, parent.parentId)

  return {
    doc: withLastEdited({ ...doc, nodes }, id),
    focus: { focusId: id, caret: 'end' },
  }
}

/** Backspace on empty line: delete node (children promote). */
export function deleteEmptyNode(
  doc: OutlineDocument,
  id: string,
): ActionResult {
  const current = doc.nodes.find((n) => n.id === id)
  if (!current || current.text.length > 0 || current.block) return { doc }

  const visible = flattenVisible(doc.nodes)
  const idx = visible.findIndex((n) => n.id === id)
  const prev = idx > 0 ? visible[idx - 1] : null

  if (doc.nodes.length === 1) {
    const nodes = doc.nodes.map((n) =>
      n.id === id ? touch(n, { text: '' }) : n,
    )
    return {
      doc: withLastEdited({ ...doc, nodes }, id),
      focus: { focusId: id, caret: 'start' },
    }
  }

  const children = getChildren(doc.nodes, id)
  let nodes = doc.nodes.filter((n) => n.id !== id)

  for (const child of children) {
    nodes = nodes.map((n) =>
      n.id === child.id
        ? { ...n, parentId: current.parentId, order: current.order + child.order }
        : n,
    )
  }

  nodes = reindexSiblings(nodes, current.parentId)

  const focusId = prev?.id ?? siblingsOf(nodes, null)[0]?.id
  return {
    doc: withLastEdited({ ...doc, nodes }, focusId ?? null),
    focus: focusId ? { focusId, caret: 'end' } : undefined,
  }
}

export function moveAmongSiblings(
  doc: OutlineDocument,
  id: string,
  direction: -1 | 1,
): ActionResult {
  const current = doc.nodes.find((n) => n.id === id)
  if (!current) return { doc }

  const siblings = siblingsOf(doc.nodes, current.parentId)
  const index = siblings.findIndex((n) => n.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= siblings.length) {
    return { doc, focus: { focusId: id, caret: 'end' } }
  }

  const other = siblings[target]!
  const nodes = doc.nodes.map((n) => {
    if (n.id === id) return { ...n, order: other.order }
    if (n.id === other.id) return { ...n, order: current.order }
    return n
  })

  return {
    doc: withLastEdited(
      { ...doc, nodes: reindexSiblings(nodes, current.parentId) },
      id,
    ),
    focus: { focusId: id, caret: 'end' },
  }
}

export function ensureFocus(doc: OutlineDocument, id: string | null): string {
  if (id && doc.nodes.some((n) => n.id === id)) return id
  return (
    nextVisibleId(doc.nodes, null) ??
    doc.nodes[0]?.id ??
    ''
  )
}
