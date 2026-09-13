import type { OutlineNode, Workspace } from '../types.js'
import { CliError } from '../errors.js'
import { createEmptyDocument } from '../lib/csv.js'
import { createId } from '../lib/id.js'
import { DEFAULT_FONT_SCALE } from '../lib/fontScale.js'
import { uniqueRollName } from '../lib/rollNames.js'
import { getDepth, siblingsOf } from '../lib/outlineTree.js'
import {
  createRoll,
  findFlolinrDir,
  loadWorkspace,
  resolveRoll,
  saveWorkspace,
} from '../lib/workspaceFs.js'

function open(dir?: string): { flolinrDir: string; workspace: Workspace } {
  const flolinrDir = findFlolinrDir(process.cwd(), dir)
  return { flolinrDir, workspace: loadWorkspace(flolinrDir) }
}

export function cmdRolls(dir?: string): string {
  const { workspace } = open(dir)
  if (workspace.rolls.length === 0) return '(no rolls)\n'
  const lines = workspace.rolls.map((roll) => {
    const flag = roll.archived ? 'archived' : 'active'
    return `${roll.name}\t${roll.id}\t${flag}\t${roll.updatedAt}`
  })
  return `${lines.join('\n')}\n`
}

export function cmdRollNew(name: string, dir?: string): string {
  const { flolinrDir, workspace } = open(dir)
  const roll = createRoll(uniqueRollName(name, workspace.rolls), createEmptyDocument())
  workspace.rolls.push(roll)
  workspace.activeRollId = roll.id
  saveWorkspace(flolinrDir, workspace)
  return `${roll.name}\t${roll.id}\n`
}

export function cmdRollRename(
  nameOrId: string,
  nextName: string,
  dir?: string,
): string {
  const { flolinrDir, workspace } = open(dir)
  const roll = resolveRoll(workspace, nameOrId)
  const unique = uniqueRollName(nextName, workspace.rolls, {
    excludeRollId: roll.id,
  })
  const now = new Date().toISOString()
  const next: Workspace = {
    ...workspace,
    rolls: workspace.rolls.map((r) =>
      r.id === roll.id ? { ...r, name: unique, updatedAt: now } : r,
    ),
  }
  saveWorkspace(flolinrDir, next)
  return `${unique}\t${roll.id}\n`
}

export function cmdRollArchive(nameOrId: string, dir?: string): string {
  const { flolinrDir, workspace } = open(dir)
  const roll = resolveRoll(workspace, nameOrId)
  if (roll.archived) return `${roll.name}\talready archived\n`
  const now = new Date().toISOString()
  const rolls = workspace.rolls.map((r) =>
    r.id === roll.id ? { ...r, archived: true, updatedAt: now } : r,
  )
  const active =
    workspace.activeRollId === roll.id
      ? (rolls.find((r) => !r.archived)?.id ?? '')
      : workspace.activeRollId
  saveWorkspace(flolinrDir, { activeRollId: active, rolls })
  return `${roll.name}\tarchived\n`
}

export function cmdShow(
  nameOrId: string,
  options?: { dir?: string; ids?: boolean },
): string {
  const { workspace } = open(options?.dir)
  const roll = resolveRoll(workspace, nameOrId)
  const lines: string[] = [`# ${roll.name}`]
  function walk(parentId: string | null) {
    for (const node of siblingsOf(roll.document.nodes, parentId)) {
      const depth = getDepth(roll.document.nodes, node.id)
      const indent = '  '.repeat(depth)
      const id = options?.ids ? `  ${node.id}` : ''
      const text = node.text || (node.block ? `[${node.block.kind}]` : '')
      lines.push(`${indent}- ${text}${id}`)
      walk(node.id)
    }
  }
  walk(null)
  return `${lines.join('\n')}\n`
}

export function cmdAdd(
  nameOrId: string,
  text: string,
  options?: { dir?: string; parent?: string },
): string {
  const body = text.trim()
  if (!body) throw new CliError('Line text required')
  const { flolinrDir, workspace } = open(options?.dir)
  const roll = resolveRoll(workspace, nameOrId)
  const parentId = options?.parent?.trim() || null
  if (parentId && !roll.document.nodes.some((n) => n.id === parentId)) {
    throw new CliError(`Parent node not found: ${parentId}`, 2)
  }

  const now = new Date().toISOString()
  let nodes = [...roll.document.nodes]
  const emptyPlaceholder =
    nodes.length === 1 &&
    nodes[0]!.parentId === null &&
    nodes[0]!.text === '' &&
    !nodes[0]!.block

  const node: OutlineNode = {
    id: createId(),
    parentId,
    order: emptyPlaceholder && !parentId
      ? 0
      : siblingsOf(nodes, parentId).length,
    text: body,
    createdAt: now,
    updatedAt: now,
    collapsed: false,
    bold: false,
    strike: false,
    underline: false,
    fontScale: DEFAULT_FONT_SCALE,
    block: null,
  }

  if (emptyPlaceholder && !parentId) {
    nodes = [node]
  } else {
    nodes.push(node)
  }

  const nextRoll = {
    ...roll,
    updatedAt: now,
    document: {
      nodes,
      meta: { lastEditedId: node.id, schemaVersion: 1 as const },
    },
  }
  saveWorkspace(flolinrDir, {
    ...workspace,
    rolls: workspace.rolls.map((r) => (r.id === roll.id ? nextRoll : r)),
  })
  return `${node.id}\t${body}\n`
}
