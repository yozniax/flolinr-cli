import { dirname } from 'node:path'
import { CliError } from '../errors.js'
import { loadUserConfig, mergeVault } from '../lib/config.js'
import { FLOLINR_REPO_DIR, vaultIsConfigured } from '../lib/flolinrRepo.js'
import { currentGitRemote, initGitRepo } from '../lib/git.js'
import {
  findFlolinrDir,
  initWorkspace,
  loadRemoteConfig,
  loadWorkspace,
  saveRemoteConfig,
} from '../lib/workspaceFs.js'

export function cmdInit(options: {
  dir?: string
  git?: boolean
  remote?: string
}): string {
  const target = options.dir ?? process.cwd()
  const flolinrDir = initWorkspace(target)
  const root = dirname(flolinrDir)

  if (options.remote) {
    const vault = parseOwnerRepo(options.remote)
    saveRemoteConfig(flolinrDir, {
      ...vault,
      path: FLOLINR_REPO_DIR,
      branch: '',
    })
  }

  if (options.git) {
    const remote = options.remote ? parseOwnerRepo(options.remote) : undefined
    initGitRepo(root, remote)
  }

  return flolinrDir
}

export function parseOwnerRepo(value: string): { owner: string; repo: string } {
  const trimmed = value.trim().replace(/\.git$/, '')
  const m = /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s]+)$/.exec(trimmed)
  if (!m) {
    throw new CliError('Expected owner/repo (example: yozniax/flolinr-vault)')
  }
  return { owner: m[1]!, repo: m[2]! }
}

export function cmdStatus(dir?: string): string {
  const flolinrDir = findFlolinrDir(process.cwd(), dir)
  const workspace = loadWorkspace(flolinrDir)
  const remote = mergeVault(loadRemoteConfig(flolinrDir), loadUserConfig().vault)
  const gitRemote = currentGitRemote(flolinrDir)
  const lines = [
    `workspace  ${flolinrDir}`,
    `rolls      ${workspace.rolls.length} (${workspace.rolls.filter((r) => !r.archived).length} active)`,
  ]
  if (remote && vaultIsConfigured(remote)) {
    lines.push(
      `remote     ${remote.owner}/${remote.repo}  path=${remote.path}${remote.branch ? `  branch=${remote.branch}` : ''}`,
    )
  } else {
    lines.push('remote     (not set)')
  }
  lines.push(`git        ${gitRemote ?? '(no origin)'}`)
  return `${lines.join('\n')}\n`
}
