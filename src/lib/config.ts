import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import type { GitHubVaultConfig } from './flolinrRepo.js'
import { FLOLINR_REPO_DIR } from './flolinrRepo.js'

export type UserConfig = {
  token: string
  vault: GitHubVaultConfig
}

function configDir(): string {
  return join(homedir(), '.config', 'flolinr')
}

export function userConfigPath(): string {
  return join(configDir(), 'config.json')
}

export function loadUserConfig(): UserConfig {
  const empty: UserConfig = {
    token: '',
    vault: { owner: '', repo: '', path: FLOLINR_REPO_DIR, branch: '' },
  }
  const path = userConfigPath()
  if (!existsSync(path)) return empty
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<UserConfig> & {
      vault?: Partial<GitHubVaultConfig>
    }
    return {
      token: typeof raw.token === 'string' ? raw.token.trim() : '',
      vault: {
        owner: typeof raw.vault?.owner === 'string' ? raw.vault.owner.trim() : '',
        repo: typeof raw.vault?.repo === 'string' ? raw.vault.repo.trim() : '',
        path:
          typeof raw.vault?.path === 'string' && raw.vault.path.trim()
            ? raw.vault.path.trim()
            : FLOLINR_REPO_DIR,
        branch: typeof raw.vault?.branch === 'string' ? raw.vault.branch.trim() : '',
      },
    }
  } catch {
    return empty
  }
}

export function resolveGithubToken(): string | null {
  const fromFlolinr = process.env.FLOLINR_GITHUB_TOKEN?.trim()
  if (fromFlolinr) return fromFlolinr
  const fromGh = process.env.GH_TOKEN?.trim()
  if (fromGh) return fromGh
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (token) return token
  } catch {
    /* gh not logged in */
  }
  const fromFile = loadUserConfig().token.trim()
  return fromFile || null
}

export function mergeVault(
  workspace: GitHubVaultConfig | null,
  user: GitHubVaultConfig,
): GitHubVaultConfig | null {
  if (workspace && workspace.owner && workspace.repo) return workspace
  if (user.owner && user.repo) return user
  return null
}
