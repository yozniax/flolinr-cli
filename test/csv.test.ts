import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parseDocument, serializeDocument } from '../src/lib/csv.js'
import { collectHashtagStatsFromRolls } from '../src/lib/hashtags.js'
import { searchWorkspace } from '../src/lib/search.js'
import { loadWorkspace } from '../src/lib/workspaceFs.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureCsv = join(root, 'fixtures/vault/.flolinr/rolls/Inbox.csv')
const fixtureVault = join(root, 'fixtures/vault')

test('parseDocument reads schemaVersion 1 fixture', () => {
  const csv = readFileSync(fixtureCsv, 'utf8')
  const doc = parseDocument(csv)
  assert.equal(doc.meta.schemaVersion, 1)
  assert.equal(doc.meta.lastEditedId, '33333333-3333-4333-8333-333333333333')
  assert.equal(doc.nodes.length, 3)
  assert.equal(doc.nodes[0]?.text, 'Welcome to Inbox')
  assert.equal(doc.nodes[1]?.text, '#lunch notes')
  assert.equal(doc.nodes[2]?.parentId, '22222222-2222-4222-8222-222222222222')
  assert.equal(doc.nodes[2]?.text, 'child line')
})

test('serializeDocument round-trips the fixture', () => {
  const csv = readFileSync(fixtureCsv, 'utf8')
  const doc = parseDocument(csv)
  assert.equal(serializeDocument(doc), csv)
})

test('loadWorkspace reads fixture vault', () => {
  const workspace = loadWorkspace(join(fixtureVault, '.flolinr'))
  assert.equal(workspace.rolls.length, 1)
  assert.equal(workspace.rolls[0]?.name, 'Inbox')
  assert.equal(workspace.rolls[0]?.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  const tags = collectHashtagStatsFromRolls(workspace.rolls)
  assert.equal(tags[0]?.tag, 'lunch')
  const hits = searchWorkspace(workspace.rolls, 'child')
  assert.equal(hits.length, 1)
  assert.equal(hits[0]?.label, 'child line')
})
