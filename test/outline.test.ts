import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyDocument } from '../src/lib/csv.js'
import {
  indent,
  insertSiblingBelow,
  outdent,
  setText,
} from '../src/lib/outlineActions.js'
import { getDepth, siblingsOf } from '../src/lib/outlineTree.js'
import { KeyParser } from '../src/tui/keys.js'
import { displayWidth, padCells, sliceWidth } from '../src/tui/width.js'

test('Enter inserts a sibling; Tab indents; Shift+Tab outdents', () => {
  let doc = createEmptyDocument()
  const root = doc.nodes[0]!
  doc = setText(doc, root.id, 'parent').doc
  const afterEnter = insertSiblingBelow(doc, root.id)
  doc = afterEnter.doc
  const childId = afterEnter.focus?.focusId
  assert.ok(childId)
  doc = setText(doc, childId, 'child').doc
  doc = indent(doc, childId).doc
  assert.equal(getDepth(doc.nodes, childId), 1)
  assert.equal(siblingsOf(doc.nodes, root.id)[0]?.id, childId)
  doc = outdent(doc, childId).doc
  assert.equal(getDepth(doc.nodes, childId), 0)
})

test('key parser maps Enter, Tab, Shift+Tab, arrows', () => {
  const parser = new KeyParser()
  const keys = parser.feed(
    Buffer.from([
      0x0d,
      0x09,
      0x1b, 0x5b, 0x5a,
      0x1b, 0x5b, 0x41,
      0x1b, 0x5b, 0x42,
      0x18,
    ]),
  )
  assert.deepEqual(
    keys.map((k) => k.type),
    ['enter', 'tab', 'backtab', 'up', 'down', 'ctrl'],
  )
  assert.equal(keys[5] && keys[5].type === 'ctrl' ? keys[5].key : '', 'x')
  const kana = new KeyParser().feed(Buffer.from('あ', 'utf8'))
  assert.deepEqual(kana, [{ type: 'char', value: 'あ' }])
})

test('Japanese characters use two terminal cells and do not overflow a row', () => {
  assert.equal(displayWidth('あ'), 2)
  assert.equal(displayWidth('testあ'), 6)
  assert.equal(displayWidth('漢字'), 4)
  assert.equal(sliceWidth('testあいう', 6), 'testあ')
  const padded = padCells('testあ', 20)
  assert.equal(displayWidth(padded), 20)
  assert.equal(padded.startsWith('testあ'), true)
  assert.equal(displayWidth('\x1b[7mFlolinr\x1b[0m'), displayWidth('Flolinr'))
})
