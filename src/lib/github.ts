import { CliError } from '../errors.js'
import type { Roll } from '../types.js'
import { resolveGithubToken } from './config.js'
import {
  buildFlolinrAgentsMd,
  buildFlolinrManifest,
  csvToPulledRoll,
  FLOLINR_AGENTS_FILE,
  FLOLINR_MANIFEST_FILE,
  joinRepoPath,
  normalizeRepoBasePath,
  parseFlolinrManifest,
  rollToRepoCsv,
  type GitHubVaultConfig,
  type PulledRoll,
} from './flolinrRepo.js'
import { createId } from './id.js'

const GH_API = 'https://api.github.com'
const GH_ACCEPT = 'application/vnd.github+json'
const GH_API_VERSION = '2022-11-28'

export type RepoFile = {
  path: string
  content: string
  sha?: string
}

function ghHeaders(token: string): Record<string, string> {
  return {
    accept: GH_ACCEPT,
    'x-github-api-version': GH_API_VERSION,
    authorization: `Bearer ${token}`,
    'user-agent': 'flolinr-cli',
  }
}

async function ghJson<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string }
> {
  const res = await fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      ...ghHeaders(token),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 204) {
    return { ok: true, status: 204, data: null as T }
  }
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = { message: text }
    }
  }
  if (!res.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `GitHub API error (${res.status})`
    return { ok: false, status: res.status, error: message }
  }
  return { ok: true, status: res.status, data: data as T }
}

function encodeBase64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64')
}

function decodeBase64(content: string): string {
  return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8')
}

export function requireToken(): string {
  const token = resolveGithubToken()
  if (!token) {
    throw new CliError(
      'GitHub token not found. Set FLOLINR_GITHUB_TOKEN, GH_TOKEN, run `gh auth login`, or put token in ~/.config/flolinr/config.json',
    )
  }
  return token
}

export async function resolveDefaultBranch(
  token: string,
  owner: string,
  repo: string,
): Promise<string> {
  const result = await ghJson<{ default_branch?: string }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  )
  if (!result.ok) throw new CliError(result.error, result.status >= 400 ? 1 : 1)
  const branch = result.data.default_branch?.trim()
  if (!branch) throw new CliError('Repository has no default branch')
  return branch
}

type ContentFile = {
  type: 'file'
  path: string
  sha: string
  content?: string
  encoding?: string
}

type ContentDirEntry = {
  type: 'file' | 'dir' | string
  path: string
  sha: string
}

async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<
  | { ok: true; file: RepoFile }
  | { ok: false; status: number; error: string; missing?: boolean }
> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const result = await ghJson<ContentFile | ContentDirEntry[]>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}${q}`,
  )
  if (!result.ok) {
    return { ...result, missing: result.status === 404 }
  }
  if (Array.isArray(result.data) || result.data.type !== 'file') {
    return { ok: false, status: 400, error: `Not a file: ${path}` }
  }
  if (result.data.encoding !== 'base64' || typeof result.data.content !== 'string') {
    return { ok: false, status: 500, error: `Unexpected encoding for ${path}` }
  }
  return {
    ok: true,
    file: {
      path: result.data.path,
      sha: result.data.sha,
      content: decodeBase64(result.data.content),
    },
  }
}

async function putFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string,
): Promise<void> {
  const body: Record<string, string> = {
    message,
    content: encodeBase64(content),
    branch,
  }
  if (sha) body.sha = sha
  const result = await ghJson<{ content?: { sha?: string } }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  if (!result.ok) throw new CliError(result.error)
}

async function listDirectory(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<ContentDirEntry[]> {
  const q = `?ref=${encodeURIComponent(ref)}`
  const apiPath = path
    ? `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}${q}`
    : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${q}`
  const result = await ghJson<ContentDirEntry[] | ContentFile>(token, apiPath)
  if (!result.ok) {
    if (result.status === 404) return []
    throw new CliError(result.error)
  }
  if (!Array.isArray(result.data)) {
    throw new CliError(`Not a directory: ${path || '/'}`)
  }
  return result.data
}

export async function collectRepoTree(
  token: string,
  owner: string,
  repo: string,
  basePath: string,
  ref: string,
  maxFiles = 200,
): Promise<RepoFile[]> {
  const files: RepoFile[] = []
  const root = basePath.replace(/^\/+|\/+$/g, '')
  const queue: string[] = [root]

  while (queue.length > 0) {
    const dir = queue.shift()!
    let entries: ContentDirEntry[]
    try {
      entries = await listDirectory(token, owner, repo, dir, ref)
    } catch (err) {
      if (dir === root) return []
      throw err
    }
    if (entries.length === 0 && dir === root) return []
    for (const entry of entries) {
      if (entry.type === 'dir') {
        queue.push(entry.path)
        continue
      }
      if (entry.type !== 'file') continue
      if (!/\.(csv|json|md|markdown|tsv)$/i.test(entry.path)) continue
      if (files.length >= maxFiles) {
        throw new CliError(`Too many files under ${basePath} (max ${maxFiles})`)
      }
      const got = await getFileContent(token, owner, repo, entry.path, ref)
      if (!got.ok) throw new CliError(got.error)
      files.push(got.file)
    }
  }

  return files
}

export async function pushFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  message: string,
  files: Array<{ path: string; content: string }>,
): Promise<number> {
  let written = 0
  for (const file of files) {
    const existing = await getFileContent(token, owner, repo, file.path, branch)
    const sha = existing.ok ? existing.file.sha : undefined
    if (!existing.ok && !existing.missing) {
      throw new CliError(existing.error)
    }
    await putFileContent(
      token,
      owner,
      repo,
      file.path,
      file.content,
      message,
      branch,
      sha,
    )
    written += 1
  }
  return written
}

export function buildPushFiles(
  rolls: Roll[],
  basePath: string,
): Array<{ path: string; content: string }> {
  const base = normalizeRepoBasePath(basePath)
  const manifest = buildFlolinrManifest(rolls)
  const files: Array<{ path: string; content: string }> = [
    {
      path: joinRepoPath(base, FLOLINR_MANIFEST_FILE),
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    },
  ]
  for (const entry of manifest.rolls) {
    const roll = rolls.find((r) => r.id === entry.id)
    if (!roll) continue
    files.push({
      path: joinRepoPath(base, entry.file),
      content: rollToRepoCsv(roll),
    })
  }
  files.push({
    path: joinRepoPath(base, FLOLINR_AGENTS_FILE),
    content: buildFlolinrAgentsMd(),
  })
  return files
}

export function filesToPulledRolls(
  files: RepoFile[],
  basePath: string,
): { rolls: PulledRoll[]; manifestPresent: boolean } {
  const base = normalizeRepoBasePath(basePath)
  const byRel = new Map<string, string>()
  for (const file of files) {
    const rel = file.path.startsWith(`${base}/`)
      ? file.path.slice(base.length + 1)
      : file.path
    byRel.set(rel.replace(/^\/+/, ''), file.content)
  }

  const manifestRaw = byRel.get(FLOLINR_MANIFEST_FILE)
  if (!manifestRaw) {
    const rolls: PulledRoll[] = []
    for (const [rel, content] of byRel) {
      if (!/\.csv$/i.test(rel)) continue
      const baseName = rel.split('/').pop()?.replace(/\.csv$/i, '') || 'Untitled'
      rolls.push(
        csvToPulledRoll(
          {
            id: createId(),
            name: baseName,
            file: rel,
            updatedAt: new Date().toISOString(),
          },
          content,
        ),
      )
    }
    return { rolls, manifestPresent: false }
  }

  const manifest = parseFlolinrManifest(manifestRaw)
  const rolls: PulledRoll[] = []
  for (const entry of manifest.rolls) {
    const csv = byRel.get(entry.file.replace(/^\/+/, ''))
    if (!csv) continue
    rolls.push(csvToPulledRoll(entry, csv))
  }
  return { rolls, manifestPresent: true }
}

export async function resolveBranch(
  token: string,
  vault: GitHubVaultConfig,
): Promise<string> {
  if (vault.branch.trim()) return vault.branch.trim()
  return resolveDefaultBranch(token, vault.owner, vault.repo)
}
