#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { register } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist/cli.js')

if (existsSync(dist)) {
  await import(pathToFileURL(dist).href)
} else {
  register('tsx/esm', pathToFileURL(root))
  await import(pathToFileURL(join(root, 'src/cli.ts')).href)
}
