import type { OutlineDocument, Roll, Workspace } from '../types.js'
import { parseDocument, serializeDocument } from './csv.js'
import { createId } from './id.js'
import { uniqueRollName } from './rollNames.js'

/** On-disk / Git layout under a vault repo root. */
export const FLOLINR_REPO_DIR = '.flolinr'
export const FLOLINR_MANIFEST_FILE = 'manifest.json'
export const FLOLINR_ROLLS_DIR = 'rolls'
export const FLOLINR_AGENTS_FILE = 'AGENTS.md'
export const FLOLINR_REMOTE_FILE = 'remote.json'
export const FLOLINR_MANIFEST_SCHEMA_VERSION = 1 as const

export type FlolinrManifestRoll = {
  id: string
  name: string
  file: string
  updatedAt: string
  archived?: boolean
}

export type FlolinrManifest = {
  schemaVersion: typeof FLOLINR_MANIFEST_SCHEMA_VERSION
  rolls: FlolinrManifestRoll[]
}

export type GitHubVaultConfig = {
  owner: string
  repo: string
  path: string
  branch: string
}

export type PulledRoll = {
  id: string
  name: string
  updatedAt: string
  archived: boolean
  document: OutlineDocument
  csv: string
  file?: string
}

export function sanitizeRollFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'untitled'
}

export function rollCsvRelativePath(name: string, rollId: string, used: Set<string>): string {
  let base = sanitizeRollFilename(name)
  let file = `${FLOLINR_ROLLS_DIR}/${base}.csv`
  if (used.has(file.toLowerCase())) {
    const short = rollId.replace(/-/g, '').slice(0, 8)
    file = `${FLOLINR_ROLLS_DIR}/${base}__${short}.csv`
  }
  used.add(file.toLowerCase())
  return file
}

export function buildFlolinrManifest(rolls: Roll[]): FlolinrManifest {
  const used = new Set<string>()
  return {
    schemaVersion: FLOLINR_MANIFEST_SCHEMA_VERSION,
    rolls: rolls.map((roll) => ({
      id: roll.id,
      name: roll.name,
      file: rollCsvRelativePath(roll.name, roll.id, used),
      updatedAt: roll.updatedAt,
      archived: roll.archived === true,
    })),
  }
}

export function parseFlolinrManifest(raw: string): FlolinrManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('Invalid manifest.json (not JSON)')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid manifest.json')
  }
  const obj = parsed as Partial<FlolinrManifest>
  if (!Array.isArray(obj.rolls)) {
    throw new Error('manifest.json missing rolls[]')
  }
  const rolls: FlolinrManifestRoll[] = obj.rolls.map((r, i) => {
    if (!r || typeof r !== 'object') {
      throw new Error(`manifest.json rolls[${i}] is invalid`)
    }
    const id = typeof r.id === 'string' && r.id ? r.id : createId()
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Untitled'
    const file =
      typeof r.file === 'string' && r.file.trim()
        ? r.file.trim().replace(/^\/+/, '')
        : `${FLOLINR_ROLLS_DIR}/${sanitizeRollFilename(name)}.csv`
    const updatedAt =
      typeof r.updatedAt === 'string' && r.updatedAt
        ? r.updatedAt
        : new Date().toISOString()
    return {
      id,
      name,
      file,
      updatedAt,
      archived: r.archived === true,
    }
  })
  return {
    schemaVersion: FLOLINR_MANIFEST_SCHEMA_VERSION,
    rolls,
  }
}

export function buildFlolinrAgentsMd(): string {
  return `# Flolinr Roll conventions

This directory is a Flolinr workspace export (schemaVersion ${FLOLINR_MANIFEST_SCHEMA_VERSION}).

## Layout

- \`${FLOLINR_MANIFEST_FILE}\` — roll index (\`id\`, \`name\`, \`file\`, \`updatedAt\`)
- \`${FLOLINR_ROLLS_DIR}/*.csv\` — one outline Roll per file (canonical)
- \`${FLOLINR_AGENTS_FILE}\` — this file

## Editing Rolls (CSV)

- Prefer editing the CSV files, not inventing a parallel format.
- **Never change the \`id\` column** for existing rows. Stable ids keep outline identity across sync.
- Keep the header row and trailing meta lines:
  - \`# last_edited_id,<uuid>\`
  - \`# schema_version,1\`
- Column order:
  \`order,text,timestamp,id,parent_id,updated_at,collapsed,bold,strike,underline,font_scale,block_kind,block_lang,block_content,block_checked,block_pinned\`
- When adding a row, mint a new UUID for \`id\`, set \`parent_id\` to an existing node or empty for root, and bump \`updated_at\` (ISO 8601).
- When renaming a Roll, update both the CSV filename reference in \`${FLOLINR_MANIFEST_FILE}\` and the \`name\` field; keep the same roll \`id\`.
- Bookmarks are not stored in CSV; do not invent bookmark columns.

## Sync

Flolinr pushes/pulls this tree manually. Last write wins per explicit Push or Pull.

A Roll may instead use a dedicated GitHub repository (bound from the Roll header).
That dedicated repo is canonical for that Roll; vault sync skips it.
`
}

export function joinRepoPath(basePath: string, relative: string): string {
  const base = basePath.replace(/^\/+|\/+$/g, '')
  const rel = relative.replace(/^\/+/, '')
  return base ? `${base}/${rel}` : rel
}

export function normalizeRepoBasePath(path: string | null | undefined): string {
  const trimmed = (path ?? FLOLINR_REPO_DIR).trim().replace(/^\/+|\/+$/g, '')
  return trimmed || FLOLINR_REPO_DIR
}

export function applyPulledRolls(
  workspace: Workspace,
  pulled: PulledRoll[],
): Workspace {
  if (pulled.length === 0) return workspace

  const byId = new Map(workspace.rolls.map((r) => [r.id, r]))
  const now = new Date().toISOString()
  let rolls = [...workspace.rolls]
  let activeRollId = workspace.activeRollId

  for (const remote of pulled) {
    const existing = byId.get(remote.id)
    if (existing) {
      rolls = rolls.map((r) =>
        r.id === remote.id
          ? {
              ...r,
              name: uniqueRollName(remote.name, rolls, {
                excludeRollId: remote.id,
              }),
              updatedAt: remote.updatedAt || now,
              archived: remote.archived,
              document: remote.document,
            }
          : r,
      )
    } else {
      const roll: Roll = {
        id: remote.id,
        name: uniqueRollName(remote.name, rolls),
        createdAt: remote.updatedAt || now,
        updatedAt: remote.updatedAt || now,
        archived: remote.archived,
        document: remote.document,
      }
      rolls = [...rolls, roll]
      byId.set(roll.id, roll)
      if (!rolls.some((r) => r.id === activeRollId && !r.archived)) {
        activeRollId = roll.id
      }
    }
  }

  const active =
    rolls.find((r) => r.id === activeRollId && !r.archived) ??
    rolls.find((r) => !r.archived) ??
    rolls[0]

  if (!active) {
    return { activeRollId: '', rolls: [] }
  }

  return { activeRollId: active.id, rolls }
}

export function rollToRepoCsv(roll: Roll): string {
  return serializeDocument(roll.document)
}

export function csvToPulledRoll(
  entry: FlolinrManifestRoll,
  csv: string,
): PulledRoll {
  return {
    id: entry.id,
    name: entry.name,
    updatedAt: entry.updatedAt,
    archived: entry.archived === true,
    document: parseDocument(csv),
    csv,
    file: entry.file,
  }
}

export function vaultIsConfigured(config: GitHubVaultConfig): boolean {
  return Boolean(config.owner.trim() && config.repo.trim())
}
