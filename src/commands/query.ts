import { CliError } from '../errors.js'
import { buildHashtagChunks, collectHashtagStatsFromRolls } from '../lib/hashtags.js'
import { buildLogChunks, collectLogDays, parseLogDay } from '../lib/logs.js'
import { searchWorkspace } from '../lib/search.js'
import { findFlolinrDir, loadWorkspace } from '../lib/workspaceFs.js'

export function cmdSearch(query: string, dir?: string): string {
  const q = query.trim()
  if (!q) throw new CliError('Search query required')
  const workspace = loadWorkspace(findFlolinrDir(process.cwd(), dir))
  const hits = searchWorkspace(workspace.rolls, q)
  if (hits.length === 0) return '(no matches)\n'
  return `${hits
    .map((hit) => {
      const arch = hit.archived ? ' [archived]' : ''
      return `${hit.rollName}${arch}\t${hit.label}\t${hit.nodeId}\n  ${hit.snippet}`
    })
    .join('\n')}\n`
}

export function cmdTags(tag: string | undefined, dir?: string): string {
  const workspace = loadWorkspace(findFlolinrDir(process.cwd(), dir))
  const name = tag?.replace(/^#/, '').trim()
  if (!name) {
    const stats = collectHashtagStatsFromRolls(workspace.rolls)
    if (stats.length === 0) return '(no tags)\n'
    return `${stats.map((s) => `${s.tag}\t${s.count}`).join('\n')}\n`
  }
  const chunks = buildHashtagChunks(workspace.rolls, name)
  if (chunks.length === 0) return `(no lines tagged #${name})\n`
  const lines: string[] = []
  for (const chunk of chunks) {
    lines.push(`# ${chunk.rollName}`)
    for (const entry of chunk.entries) {
      const indent = '  '.repeat(entry.depth)
      lines.push(`${indent}- ${entry.node.text}`)
    }
  }
  return `${lines.join('\n')}\n`
}

export function cmdLogs(day: string | undefined, dir?: string): string {
  const workspace = loadWorkspace(findFlolinrDir(process.cwd(), dir))
  if (!day) {
    const days = collectLogDays(workspace.rolls)
    if (days.length === 0) return '(no log days)\n'
    return `${days.map((d) => `${d.dayKey}\t${d.count}`).join('\n')}\n`
  }
  const key = parseLogDay(day)
  if (!key) throw new CliError(`Invalid day: ${day} (use YYYY-MM-DD)`)
  const chunks = buildLogChunks(workspace.rolls, key)
  if (chunks.length === 0) return `(no lines on ${key})\n`
  const lines: string[] = [`# ${key}`]
  for (const chunk of chunks) {
    lines.push(`## ${chunk.rollName}`)
    for (const entry of chunk.entries) {
      const indent = '  '.repeat(entry.depth)
      lines.push(`${indent}- ${entry.node.text}`)
    }
  }
  return `${lines.join('\n')}\n`
}
