import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { CliError } from '../errors.js'
import { parseDocument, serializeDocument } from '../lib/csv.js'
import { documentToMarkdown, markdownToDocument } from '../lib/markdown.js'
import { uniqueRollName } from '../lib/rollNames.js'
import {
  createRoll,
  findFlolinrDir,
  loadWorkspace,
  resolveRoll,
  saveWorkspace,
} from '../lib/workspaceFs.js'

export function cmdImport(file: string, dir?: string): string {
  const path = resolve(file)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    throw new CliError(`Cannot read ${file}`, 2)
  }
  const lower = path.toLowerCase()
  const document = lower.endsWith('.md') || lower.endsWith('.markdown')
    ? markdownToDocument(raw)
    : parseDocument(raw)
  const name = basename(path).replace(/\.(csv|md|markdown|tsv)$/i, '') || 'Imported'
  const flolinrDir = findFlolinrDir(process.cwd(), dir)
  const workspace = loadWorkspace(flolinrDir)
  const roll = createRoll(uniqueRollName(name, workspace.rolls), document)
  workspace.rolls.push(roll)
  workspace.activeRollId = roll.id
  saveWorkspace(flolinrDir, workspace)
  return `${roll.name}\t${roll.id}\n`
}

export function cmdExport(
  nameOrId: string,
  options?: { dir?: string; format?: string; out?: string },
): string {
  const workspace = loadWorkspace(findFlolinrDir(process.cwd(), options?.dir))
  const roll = resolveRoll(workspace, nameOrId)
  const format = (options?.format ?? 'csv').toLowerCase()
  let body: string
  if (format === 'md' || format === 'markdown') {
    body = documentToMarkdown(roll.document)
  } else if (format === 'csv') {
    body = serializeDocument(roll.document)
  } else {
    throw new CliError(`Unknown format: ${format} (csv|md)`)
  }
  if (options?.out) {
    writeFileSync(resolve(options.out), body, 'utf8')
    return `${options.out}\n`
  }
  return body
}
