import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { Roll, Workspace } from '../types.js'
import { CliError } from '../errors.js'
import { parseDocument } from './csv.js'
import { createId } from './id.js'
import {
  buildFlolinrAgentsMd,
  buildFlolinrManifest,
  csvToPulledRoll,
  FLOLINR_AGENTS_FILE,
  FLOLINR_MANIFEST_FILE,
  FLOLINR_REMOTE_FILE,
  FLOLINR_REPO_DIR,
  FLOLINR_ROLLS_DIR,
  parseFlolinrManifest,
  rollToRepoCsv,
  type GitHubVaultConfig,
} from './flolinrRepo.js'

export function findFlolinrDir(start = process.cwd(), explicit?: string): string {
  if (explicit) {
    const target = resolve(explicit)
    if (basename(target) === FLOLINR_REPO_DIR && existsSync(target)) {
      return target
    }
    const nested = join(target, FLOLINR_REPO_DIR)
    if (existsSync(nested) && statSync(nested).isDirectory()) return nested
    throw new CliError(`No .flolinr directory at ${explicit}`)
  }

  let dir = resolve(start)
  while (true) {
    const candidate = join(dir, FLOLINR_REPO_DIR)
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new CliError('No .flolinr workspace found. Run `flolinr init` first.')
}

export function findOrCreateFlolinrDir(
  start = process.cwd(),
  explicit?: string,
): string {
  try {
    return findFlolinrDir(start, explicit)
  } catch {
    return initWorkspace(explicit ? resolve(explicit) : start)
  }
}

export function emptyWorkspace(): Workspace {
  return { activeRollId: '', rolls: [] }
}

export function loadWorkspace(flolinrDir: string): Workspace {
  const manifestPath = join(flolinrDir, FLOLINR_MANIFEST_FILE)
  if (!existsSync(manifestPath)) {
    const rollsDir = join(flolinrDir, FLOLINR_ROLLS_DIR)
    if (!existsSync(rollsDir)) return emptyWorkspace()
    const rolls: Roll[] = []
    for (const name of readdirSync(rollsDir)) {
      if (!name.toLowerCase().endsWith('.csv')) continue
      const csv = readFileSync(join(rollsDir, name), 'utf8')
      const baseName = name.replace(/\.csv$/i, '')
      const pulled = csvToPulledRoll(
        {
          id: createId(),
          name: baseName,
          file: `${FLOLINR_ROLLS_DIR}/${name}`,
          updatedAt: new Date().toISOString(),
        },
        csv,
      )
      rolls.push(pulledToRoll(pulled))
    }
    return {
      activeRollId: rolls.find((r) => !r.archived)?.id ?? rolls[0]?.id ?? '',
      rolls,
    }
  }

  const manifest = parseFlolinrManifest(readFileSync(manifestPath, 'utf8'))
  const rolls: Roll[] = []
  for (const entry of manifest.rolls) {
    const csvPath = join(flolinrDir, entry.file)
    if (!existsSync(csvPath)) continue
    rolls.push(pulledToRoll(csvToPulledRoll(entry, readFileSync(csvPath, 'utf8'))))
  }
  return {
    activeRollId: rolls.find((r) => !r.archived)?.id ?? rolls[0]?.id ?? '',
    rolls,
  }
}

function pulledToRoll(pulled: {
  id: string
  name: string
  updatedAt: string
  archived: boolean
  document: Roll['document']
}): Roll {
  return {
    id: pulled.id,
    name: pulled.name,
    createdAt: pulled.updatedAt,
    updatedAt: pulled.updatedAt,
    archived: pulled.archived,
    document: pulled.document,
  }
}

export function saveWorkspace(flolinrDir: string, workspace: Workspace): void {
  mkdirSync(join(flolinrDir, FLOLINR_ROLLS_DIR), { recursive: true })
  const manifest = buildFlolinrManifest(workspace.rolls)
  const keep = new Set(manifest.rolls.map((r) => r.file.replace(/^\/+/, '')))

  for (const entry of manifest.rolls) {
    const roll = workspace.rolls.find((r) => r.id === entry.id)
    if (!roll) continue
    const dest = join(flolinrDir, entry.file)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, rollToRepoCsv(roll), 'utf8')
  }

  const rollsDir = join(flolinrDir, FLOLINR_ROLLS_DIR)
  if (existsSync(rollsDir)) {
    for (const name of readdirSync(rollsDir)) {
      const rel = `${FLOLINR_ROLLS_DIR}/${name}`
      if (name.toLowerCase().endsWith('.csv') && !keep.has(rel)) {
        unlinkSync(join(rollsDir, name))
      }
    }
  }

  writeFileSync(
    join(flolinrDir, FLOLINR_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )

  const agents = join(flolinrDir, FLOLINR_AGENTS_FILE)
  if (!existsSync(agents)) {
    writeFileSync(agents, buildFlolinrAgentsMd(), 'utf8')
  }
}

export function initWorkspace(targetDir: string): string {
  const root = resolve(targetDir)
  const flolinrDir = basename(root) === FLOLINR_REPO_DIR
    ? root
    : join(root, FLOLINR_REPO_DIR)
  if (existsSync(join(flolinrDir, FLOLINR_MANIFEST_FILE))) {
    throw new CliError(`Workspace already exists at ${flolinrDir}`)
  }
  mkdirSync(join(flolinrDir, FLOLINR_ROLLS_DIR), { recursive: true })
  writeFileSync(join(flolinrDir, FLOLINR_AGENTS_FILE), buildFlolinrAgentsMd(), 'utf8')
  saveWorkspace(flolinrDir, emptyWorkspace())
  return flolinrDir
}

export function loadRemoteConfig(flolinrDir: string): GitHubVaultConfig | null {
  const path = join(flolinrDir, FLOLINR_REMOTE_FILE)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<GitHubVaultConfig>
    const config: GitHubVaultConfig = {
      owner: typeof raw.owner === 'string' ? raw.owner.trim() : '',
      repo: typeof raw.repo === 'string' ? raw.repo.trim() : '',
      path:
        typeof raw.path === 'string' && raw.path.trim()
          ? raw.path.trim().replace(/^\/+|\/+$/g, '')
          : FLOLINR_REPO_DIR,
      branch: typeof raw.branch === 'string' ? raw.branch.trim() : '',
    }
    if (!config.owner || !config.repo) return null
    return config
  } catch {
    throw new CliError(`Invalid ${FLOLINR_REMOTE_FILE}`)
  }
}

export function saveRemoteConfig(
  flolinrDir: string,
  config: GitHubVaultConfig,
): void {
  writeFileSync(
    join(flolinrDir, FLOLINR_REMOTE_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  )
}

export function tryResolveRoll(
  workspace: Workspace,
  nameOrId: string,
): Roll | null {
  try {
    return resolveRoll(workspace, nameOrId)
  } catch {
    return null
  }
}

export function resolveRoll(workspace: Workspace, nameOrId: string): Roll {
  const key = nameOrId.trim()
  if (!key) throw new CliError('Roll name or id required')
  const exactId = workspace.rolls.find((r) => r.id === key)
  if (exactId) return exactId
  const exactName = workspace.rolls.filter(
    (r) => r.name.toLowerCase() === key.toLowerCase(),
  )
  if (exactName.length === 1) return exactName[0]!
  if (exactName.length > 1) {
    throw new CliError(`Multiple rolls named “${key}”; use a roll id`)
  }
  const prefix = workspace.rolls.filter((r) => r.id.startsWith(key))
  if (prefix.length === 1) return prefix[0]!
  throw new CliError(`Roll not found: ${key}`, 2)
}

export function createRoll(name: string, document: Roll['document']): Roll {
  const now = new Date().toISOString()
  return {
    id: createId(),
    name: name.trim() || 'Untitled',
    createdAt: now,
    updatedAt: now,
    archived: false,
    document,
  }
}

export function parseDocumentFromCsvFile(filePath: string): Roll['document'] {
  return parseDocument(readFileSync(filePath, 'utf8'))
}
