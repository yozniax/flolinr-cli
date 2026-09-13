import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'src/cli.ts')

function run(args: string[], cwd: string): string {
  return execFileSync('npx', ['tsx', cli, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

test('init, roll, add, search, tags, logs, export', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flolinr-cli-'))
  const out = run(['init', '--dir', dir], dir)
  assert.match(out, /\.flolinr/)

  run(['roll', 'new', 'Inbox', '--dir', dir], dir)
  run(['add', 'Inbox', 'think in lines #idea', '--dir', dir], dir)
  run(['add', 'Inbox', 'second line', '--dir', dir], dir)

  const rolls = run(['rolls', '--dir', dir], dir)
  assert.match(rolls, /Inbox/)

  const show = run(['show', 'Inbox', '--dir', dir], dir)
  assert.match(show, /think in lines #idea/)
  assert.match(show, /second line/)

  const search = run(['search', 'lines', '--dir', dir], dir)
  assert.match(search, /think in lines/)

  const tags = run(['tags', '--dir', dir], dir)
  assert.match(tags, /idea/)

  const logs = run(['logs', '--dir', dir], dir)
  assert.match(logs, /\d{4}-\d{2}-\d{2}/)

  const exported = run(['export', 'Inbox', '--format', 'csv', '--dir', dir], dir)
  assert.match(exported, /# schema_version,1/)
  assert.match(exported, /think in lines #idea/)

  const md = run(['export', 'Inbox', '--format', 'md', '--dir', dir], dir)
  assert.match(md, /- think in lines #idea/)

  const manifest = JSON.parse(
    readFileSync(join(dir, '.flolinr/manifest.json'), 'utf8'),
  ) as { schemaVersion: number; rolls: Array<{ name: string }> }
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.rolls[0]?.name, 'Inbox')
})

test('import markdown creates a roll', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flolinr-cli-'))
  run(['init', '--dir', dir], dir)
  const mdPath = join(dir, 'notes.md')
  writeFileSync(mdPath, '# Notes\n\n- alpha\n- bravo\n')
  const imported = run(['import', mdPath, '--dir', dir], dir)
  assert.match(imported, /notes/)
  const show = run(['show', 'notes', '--dir', dir], dir)
  assert.match(show, /Notes|alpha|bravo/)
})

test('remote set writes remote.json; init --git creates a repo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flolinr-cli-'))
  run(['init', '--git', '--remote', 'yozniax/flolinr-vault', '--dir', dir], dir)
  const remote = JSON.parse(
    readFileSync(join(dir, '.flolinr/remote.json'), 'utf8'),
  ) as { owner: string; repo: string; path: string }
  assert.equal(remote.owner, 'yozniax')
  assert.equal(remote.repo, 'flolinr-vault')
  assert.equal(remote.path, '.flolinr')
  const shown = run(['remote', 'show', '--dir', dir], dir)
  assert.match(shown, /yozniax\/flolinr-vault/)
  const status = run(['status', '--dir', dir], dir)
  assert.match(status, /yozniax\/flolinr-vault/)
})
