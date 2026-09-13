#!/usr/bin/env node
import { existsSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'bin/flolinr.mjs')
const destDir = join(homedir(), '.local', 'bin')
const dest = join(destDir, 'flolinr')

if (!existsSync(source)) {
  console.error(`Missing ${source}`)
  process.exit(1)
}

mkdirSync(destDir, { recursive: true })
try {
  unlinkSync(dest)
} catch {
  /* not present */
}
symlinkSync(source, dest)
console.log(`linked ${dest} -> ${source}`)
console.log('Run: flolinr --help')
