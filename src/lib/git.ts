import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { CliError } from '../errors.js'

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CliError(`git ${args.join(' ')} failed: ${message}`)
  }
}

export function findGitRoot(start: string): string | null {
  let dir = start
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function initGitRepo(dir: string, remote?: { owner: string; repo: string }): void {
  if (!existsSync(join(dir, '.git'))) {
    runGit(dir, ['init'])
  }
  if (remote) {
    const url = `https://github.com/${remote.owner}/${remote.repo}.git`
    try {
      runGit(dir, ['remote', 'get-url', 'origin'])
      runGit(dir, ['remote', 'set-url', 'origin', url])
    } catch {
      runGit(dir, ['remote', 'add', 'origin', url])
    }
  }
}

export function currentGitRemote(dir: string): string | null {
  const root = findGitRoot(dir)
  if (!root) return null
  try {
    return runGit(root, ['remote', 'get-url', 'origin'])
  } catch {
    return null
  }
}
