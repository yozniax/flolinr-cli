import { CliError } from '../errors.js'
import { loadUserConfig, mergeVault } from '../lib/config.js'
import { FLOLINR_REPO_DIR, applyPulledRolls, vaultIsConfigured } from '../lib/flolinrRepo.js'
import {
  buildPushFiles,
  collectRepoTree,
  filesToPulledRolls,
  pushFiles,
  requireToken,
  resolveBranch,
} from '../lib/github.js'
import {
  findFlolinrDir,
  loadRemoteConfig,
  loadWorkspace,
  saveRemoteConfig,
  saveWorkspace,
} from '../lib/workspaceFs.js'
import { parseOwnerRepo } from './workspace.js'

export function cmdRemoteShow(dir?: string): string {
  const flolinrDir = findFlolinrDir(process.cwd(), dir)
  const remote = mergeVault(loadRemoteConfig(flolinrDir), loadUserConfig().vault)
  if (!remote || !vaultIsConfigured(remote)) {
    return 'remote     (not set)\n'
  }
  return `remote     ${remote.owner}/${remote.repo}\npath       ${remote.path}\nbranch     ${remote.branch || '(default)'}\n`
}

export function cmdRemoteSet(
  ownerRepo: string,
  options?: { dir?: string; path?: string; branch?: string },
): string {
  const flolinrDir = findFlolinrDir(process.cwd(), options?.dir)
  const { owner, repo } = parseOwnerRepo(ownerRepo)
  const config = {
    owner,
    repo,
    path: options?.path?.trim() || FLOLINR_REPO_DIR,
    branch: options?.branch?.trim() || '',
  }
  saveRemoteConfig(flolinrDir, config)
  return `remote     ${owner}/${repo}\npath       ${config.path}\nbranch     ${config.branch || '(default)'}\n`
}

export async function cmdPush(dir?: string): Promise<string> {
  const flolinrDir = findFlolinrDir(process.cwd(), dir)
  const vault = mergeVault(loadRemoteConfig(flolinrDir), loadUserConfig().vault)
  if (!vault || !vaultIsConfigured(vault)) {
    throw new CliError('Remote not set. Run `flolinr remote set owner/repo`')
  }
  const workspace = loadWorkspace(flolinrDir)
  const token = requireToken()
  const branch = await resolveBranch(token, vault)
  const files = buildPushFiles(workspace.rolls, vault.path)
  const written = await pushFiles(
    token,
    vault.owner,
    vault.repo,
    branch,
    `flolinr: sync ${workspace.rolls.length} roll${workspace.rolls.length === 1 ? '' : 's'}`,
    files,
  )
  return `pushed ${written} files to ${vault.owner}/${vault.repo}@${branch}\n`
}

export async function cmdPull(dir?: string): Promise<string> {
  const flolinrDir = findFlolinrDir(process.cwd(), dir)
  const vault = mergeVault(loadRemoteConfig(flolinrDir), loadUserConfig().vault)
  if (!vault || !vaultIsConfigured(vault)) {
    throw new CliError('Remote not set. Run `flolinr remote set owner/repo`')
  }
  const token = requireToken()
  const branch = await resolveBranch(token, vault)
  const files = await collectRepoTree(
    token,
    vault.owner,
    vault.repo,
    vault.path,
    branch,
  )
  const { rolls } = filesToPulledRolls(files, vault.path)
  const merged = applyPulledRolls(loadWorkspace(flolinrDir), rolls)
  saveWorkspace(flolinrDir, merged)
  return `pulled ${rolls.length} roll${rolls.length === 1 ? '' : 's'} from ${vault.owner}/${vault.repo}@${branch}\n`
}
