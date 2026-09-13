import type { Roll, Workspace } from '../types.js'
import { CliError } from '../errors.js'
import { createEmptyDocument } from '../lib/csv.js'
import {
  deleteEmptyNode,
  ensureFocus,
  indent,
  insertSiblingBelow,
  moveAmongSiblings,
  outdent,
  setText,
  toggleCollapse,
  type ActionResult,
} from '../lib/outlineActions.js'
import {
  flattenVisible,
  getDepth,
  hasChildren,
  nextVisibleId,
  prevVisibleId,
} from '../lib/outlineTree.js'
import { uniqueRollName } from '../lib/rollNames.js'
import {
  createRoll,
  findOrCreateFlolinrDir,
  loadWorkspace,
  saveWorkspace,
  tryResolveRoll,
} from '../lib/workspaceFs.js'
import { USAGE_LINES } from '../help.js'
import { KeyParser, type Key } from './keys.js'
import { chars, displayWidth, padCells, sliceWidth } from './width.js'

const ESC = '\x1b'
const ALT = `${ESC}[?1049h${ESC}[?7l${ESC}[?25h`
const LEAVE = `${ESC}[?7h${ESC}[?1049l${ESC}[?25h${ESC}[0m`
const HIDE = `${ESC}[?25l`
const SHOW = `${ESC}[?25h`

type Mode = 'edit' | 'rolls' | 'help'

const COMMANDS = new Set([
  'init',
  'status',
  'rolls',
  'ls',
  'roll',
  'show',
  'add',
  'search',
  'tags',
  'logs',
  'import',
  'export',
  'remote',
  'push',
  'pull',
  'help',
  'version',
  'edit',
])

export function isReservedCommand(name: string): boolean {
  return COMMANDS.has(name)
}

export async function runTui(options: {
  dir?: string
  roll?: string
}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new CliError(
      'flolinr needs a terminal (TTY). Open it in a real Terminal, or use a command such as `flolinr status`.',
    )
  }

  const flolinrDir = findOrCreateFlolinrDir(process.cwd(), options.dir)
  let workspace = ensureInbox(flolinrDir, loadWorkspace(flolinrDir))
  let roll = pickRoll(workspace, options.roll)
  workspace = { ...workspace, activeRollId: roll.id }

  const state = {
    flolinrDir,
    workspace,
    roll,
    doc: roll.document,
    focusId: ensureFocus(roll.document, roll.document.meta.lastEditedId),
    draft: '',
    caret: 0,
    scroll: 0,
    mode: 'edit' as Mode,
    rollIndex: 0,
    dirty: false,
    message: '',
    help: false,
    helpScroll: 0,
  }
  syncDraftFromFocus()

  function syncDraftFromFocus() {
    const node = state.doc.nodes.find((n) => n.id === state.focusId)
    state.draft = node?.text ?? ''
    state.caret = chars(state.draft).length
  }

  function flushDraft() {
    const node = state.doc.nodes.find((n) => n.id === state.focusId)
    if (!node || node.text === state.draft) return
    apply(setText(state.doc, state.focusId, state.draft), { keepCaret: true })
  }

  function apply(result: ActionResult, opts?: { keepCaret?: boolean }) {
    state.doc = result.doc
    state.dirty = true
    if (result.focus) {
      state.focusId = result.focus.focusId
      const node = state.doc.nodes.find((n) => n.id === state.focusId)
      state.draft = node?.text ?? ''
      if (opts?.keepCaret) {
        state.caret = Math.min(state.caret, chars(state.draft).length)
      } else if (result.focus.caret === 'start') {
        state.caret = 0
      } else {
        state.caret = chars(state.draft).length
      }
    }
    scheduleSave()
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      persist()
    }, 400)
  }

  function persist() {
    flushDraft()
    const now = new Date().toISOString()
    const nextRoll: Roll = {
      ...state.roll,
      document: state.doc,
      updatedAt: now,
    }
    state.roll = nextRoll
    state.workspace = {
      activeRollId: nextRoll.id,
      rolls: state.workspace.rolls.map((r) =>
        r.id === nextRoll.id ? nextRoll : r,
      ),
    }
    saveWorkspace(state.flolinrDir, state.workspace)
    state.dirty = false
    state.message = 'saved'
  }

  function switchRoll(next: Roll) {
    flushDraft()
    persist()
    state.roll = next
    state.doc = next.document
    state.focusId = ensureFocus(next.document, next.document.meta.lastEditedId)
    syncDraftFromFocus()
    state.scroll = 0
    state.mode = 'edit'
    state.workspace = { ...state.workspace, activeRollId: next.id }
    saveWorkspace(state.flolinrDir, state.workspace)
  }

  function visible() {
    return flattenVisible(state.doc.nodes)
  }

  function moveFocus(id: string | null) {
    if (!id) return
    flushDraft()
    state.focusId = id
    syncDraftFromFocus()
  }

  function insertAtCaret(ch: string) {
    const list = chars(state.draft)
    const i = clamp(state.caret, 0, list.length)
    state.draft = [...list.slice(0, i), ch, ...list.slice(i)].join('')
    state.caret = i + 1
    state.dirty = true
    scheduleSave()
  }

  function backspace() {
    if (state.caret > 0) {
      const list = chars(state.draft)
      const i = state.caret
      state.draft = [...list.slice(0, i - 1), ...list.slice(i)].join('')
      state.caret = i - 1
      state.dirty = true
      scheduleSave()
      return
    }
    if (state.draft.length > 0) return
    flushDraft()
    apply(deleteEmptyNode(state.doc, state.focusId))
  }

  function deleteForward() {
    const list = chars(state.draft)
    if (state.caret >= list.length) return
    state.draft = [...list.slice(0, state.caret), ...list.slice(state.caret + 1)].join('')
    state.dirty = true
    scheduleSave()
  }

  function handleEdit(key: Key) {
    if (key.type === 'char') {
      if (key.value === '\x7f') return
      insertAtCaret(key.value)
      return
    }
    if (key.type === 'enter') {
      flushDraft()
      apply(insertSiblingBelow(state.doc, state.focusId))
      return
    }
    if (key.type === 'tab') {
      flushDraft()
      apply(indent(state.doc, state.focusId))
      return
    }
    if (key.type === 'backtab') {
      flushDraft()
      apply(outdent(state.doc, state.focusId))
      return
    }
    if (key.type === 'backspace') {
      backspace()
      return
    }
    if (key.type === 'delete') {
      deleteForward()
      return
    }
    if (key.type === 'up' || (key.type === 'ctrl' && key.key === 'p')) {
      moveFocus(prevVisibleId(state.doc.nodes, state.focusId))
      return
    }
    if (key.type === 'down' || (key.type === 'ctrl' && key.key === 'n')) {
      moveFocus(nextVisibleId(state.doc.nodes, state.focusId))
      return
    }
    if (key.type === 'left') {
      state.caret = Math.max(0, state.caret - 1)
      return
    }
    if (key.type === 'right') {
      state.caret = Math.min(chars(state.draft).length, state.caret + 1)
      return
    }
    if (key.type === 'home') {
      state.caret = 0
      return
    }
    if (key.type === 'end') {
      state.caret = chars(state.draft).length
      return
    }
    if (key.type === 'pageup') {
      const rows = Math.max(1, (process.stdout.rows ?? 24) - 4)
      const list = visible()
      const idx = Math.max(0, list.findIndex((n) => n.id === state.focusId) - rows)
      moveFocus(list[idx]?.id ?? list[0]?.id ?? null)
      return
    }
    if (key.type === 'pagedown') {
      const rows = Math.max(1, (process.stdout.rows ?? 24) - 4)
      const list = visible()
      const idx = Math.min(
        list.length - 1,
        list.findIndex((n) => n.id === state.focusId) + rows,
      )
      moveFocus(list[idx]?.id ?? list[list.length - 1]?.id ?? null)
      return
    }
    if (key.type === 'alt-up' || key.type === 'ctrl-up') {
      flushDraft()
      apply(moveAmongSiblings(state.doc, state.focusId, -1))
      return
    }
    if (key.type === 'alt-down' || key.type === 'ctrl-down') {
      flushDraft()
      apply(moveAmongSiblings(state.doc, state.focusId, 1))
      return
    }
    if (key.type === 'ctrl') {
      if (key.key === 'x' || key.key === 'c' || key.key === 'q') {
        quit()
        return
      }
      if (key.key === 's' || key.key === 'o') {
        persist()
        return
      }
      if (key.key === 'g') {
        state.helpScroll = 0
        state.mode = state.mode === 'help' ? 'edit' : 'help'
        return
      }
      if (key.key === 'r') {
        flushDraft()
        persist()
        const rolls = visibleRolls(state.workspace)
        state.rollIndex = Math.max(
          0,
          rolls.findIndex((r) => r.id === state.roll.id),
        )
        state.mode = 'rolls'
        return
      }
      if (key.key === 'l') {
        flushDraft()
        apply(toggleCollapse(state.doc, state.focusId), { keepCaret: true })
        return
      }
    }
  }

  function handleRolls(key: Key) {
    const rolls = visibleRolls(state.workspace)
    if (key.type === 'up' || (key.type === 'ctrl' && key.key === 'p')) {
      state.rollIndex = Math.max(0, state.rollIndex - 1)
      return
    }
    if (key.type === 'down' || (key.type === 'ctrl' && key.key === 'n')) {
      state.rollIndex = Math.min(rolls.length - 1, state.rollIndex + 1)
      return
    }
    if (key.type === 'enter') {
      const next = rolls[state.rollIndex]
      if (next) switchRoll(next)
      return
    }
    if (key.type === 'char' && key.value === 'n') {
      const name = uniqueRollName('Untitled', state.workspace.rolls)
      const created = createRoll(name, createEmptyDocument())
      state.workspace = {
        activeRollId: created.id,
        rolls: [...state.workspace.rolls, created],
      }
      saveWorkspace(state.flolinrDir, state.workspace)
      switchRoll(created)
      return
    }
    if (
      key.type === 'ctrl' &&
      (key.key === 'x' || key.key === 'c' || key.key === 'r' || key.key === '[')
    ) {
      state.mode = 'edit'
    }
    if (key.type === 'backtab' || (key.type === 'ctrl' && key.key === 'g')) {
      state.mode = 'edit'
    }
  }

  let closed = false
  function quit() {
    if (closed) return
    closed = true
    if (saveTimer) clearTimeout(saveTimer)
    try {
      persist()
    } catch {
      /* still restore tty */
    }
    cleanup()
    process.exit(0)
  }

  function cleanup() {
    process.stdin.removeListener('data', onData)
    try {
      process.stdin.setRawMode(false)
    } catch {
      /* ignore */
    }
    process.stdin.pause()
    process.stdout.write(LEAVE)
  }

  function render() {
    const cols = Math.max(20, process.stdout.columns ?? 80)
    const rows = Math.max(8, process.stdout.rows ?? 24)
    const lines: string[] = []

    if (state.mode === 'help') {
      const bodyRows = Math.max(1, rows - 2)
      const maxScroll = Math.max(0, USAGE_LINES.length - bodyRows)
      if (state.helpScroll > maxScroll) state.helpScroll = maxScroll
      lines.push('Flolinr  使い方')
      for (const row of USAGE_LINES.slice(
        state.helpScroll,
        state.helpScroll + bodyRows,
      )) {
        lines.push(row)
      }
      fillBody(lines, rows)
      lines.push('↑↓ scroll   ^G back   ^X exit')
      paint(lines, rows, cols, null)
      return
    }

    if (state.mode === 'rolls') {
      lines.push('Flolinr  rolls')
      lines.push('')
      const rolls = visibleRolls(state.workspace)
      if (rolls.length === 0) lines.push('  (no rolls)  press n')
      rolls.forEach((r, i) => {
        const mark = i === state.rollIndex ? '>' : ' '
        const cur = r.id === state.roll.id ? '*' : ' '
        lines.push(` ${mark}${cur} ${r.name}`)
      })
      fillBody(lines, rows)
      lines.push('Enter open   n new   ^R back')
      paint(lines, rows, cols, null)
      return
    }

    const list = visible()
    const bodyRows = rows - 3
    let idx = list.findIndex((n) => n.id === state.focusId)
    if (idx < 0) idx = 0
    if (idx < state.scroll) state.scroll = idx
    if (idx >= state.scroll + bodyRows) state.scroll = idx - bodyRows + 1

    const dirty = state.dirty ? ' *' : ''
    lines.push(`Flolinr  ${state.roll.name}${dirty}`)

    const shown = list.slice(state.scroll, state.scroll + bodyRows)
    let caret: { row: number; col: number } | null = null
    shown.forEach((node, i) => {
      const depth = getDepth(state.doc.nodes, node.id)
      const kids = hasChildren(state.doc.nodes, node.id)
      const mark = kids ? (node.collapsed ? '>' : 'v') : '-'
      const text = node.id === state.focusId ? state.draft : node.text
      const prefix = `${'  '.repeat(depth)}${mark} `
      const room = Math.max(1, cols - displayWidth(prefix))
      const clipped = sliceWidth(text, room)
      lines.push(`${prefix}${clipped}`)
      if (node.id === state.focusId) {
        const caretChars = chars(state.draft).slice(0, state.caret).join('')
        caret = {
          row: i + 2,
          col: displayWidth(prefix) + displayWidth(caretChars) + 1,
        }
      }
    })

    fillBody(lines, rows)
    const hint = state.message || '^G help  ^X exit  ^S save  ^R rolls  Enter  Tab  S-Tab'
    lines.push(hint)
    if (state.message === 'saved') {
      setTimeout(() => {
        if (state.message === 'saved') {
          state.message = ''
          render()
        }
      }, 800)
    }
    paint(lines, rows, cols, caret)
  }

  function paint(
    lines: string[],
    rows: number,
    cols: number,
    caret: { row: number; col: number } | null,
  ) {
    let out = HIDE
    for (let i = 0; i < rows; i += 1) {
      const inverse = i === 0 || i === rows - 1
      const content = padCells(lines[i] ?? '', cols)
      out += `${ESC}[${i + 1};1H`
      out += inverse ? `${ESC}[7m${content}${ESC}[0m` : content
      out += `${ESC}[K`
    }
    process.stdout.write(out)
    if (caret && state.mode === 'edit') {
      const r = Math.min(rows, Math.max(1, caret.row))
      const c = Math.min(cols, Math.max(1, caret.col))
      process.stdout.write(`${ESC}[${r};${c}H${SHOW}`)
    } else {
      process.stdout.write(`${ESC}[${rows};1H${HIDE}`)
    }
  }

  const parser = new KeyParser()
  function onData(chunk: Buffer) {
    if (closed) return
    for (const key of parser.feed(chunk)) {
      if (state.mode === 'help') {
        const bodyRows = Math.max(1, (process.stdout.rows ?? 24) - 2)
        const maxScroll = Math.max(0, USAGE_LINES.length - bodyRows)
        if (key.type === 'up' || (key.type === 'ctrl' && key.key === 'p')) {
          state.helpScroll = Math.max(0, state.helpScroll - 1)
        } else if (key.type === 'down' || (key.type === 'ctrl' && key.key === 'n')) {
          state.helpScroll = Math.min(maxScroll, state.helpScroll + 1)
        } else if (key.type === 'pageup') {
          state.helpScroll = Math.max(0, state.helpScroll - bodyRows)
        } else if (key.type === 'pagedown') {
          state.helpScroll = Math.min(maxScroll, state.helpScroll + bodyRows)
        } else if (key.type === 'home') {
          state.helpScroll = 0
        } else if (key.type === 'end') {
          state.helpScroll = maxScroll
        } else if (key.type === 'ctrl' && key.key === 'x') {
          quit()
        } else if (
          (key.type === 'ctrl' && (key.key === 'g' || key.key === '[')) ||
          (key.type === 'char' && key.value === 'q')
        ) {
          state.mode = 'edit'
        }
        continue
      }
      if (state.mode === 'rolls') handleRolls(key)
      else handleEdit(key)
    }
    if (!closed) render()
  }

  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', onData)
  process.stdout.write(ALT)
  process.on('SIGWINCH', () => {
    if (!closed) render()
  })
  process.on('exit', () => {
    if (!closed) cleanup()
  })
  render()

  await new Promise<void>(() => {
    /* raw-mode loop; quit() exits */
  })
}

function ensureInbox(flolinrDir: string, workspace: Workspace): Workspace {
  if (workspace.rolls.some((r) => !r.archived)) return workspace
  const roll = createRoll('Inbox', createEmptyDocument())
  const next = { activeRollId: roll.id, rolls: [...workspace.rolls, roll] }
  saveWorkspace(flolinrDir, next)
  return next
}

function pickRoll(workspace: Workspace, nameOrId?: string): Roll {
  if (nameOrId) {
    const found = tryResolveRoll(workspace, nameOrId)
    if (!found) throw new CliError(`Roll not found: ${nameOrId}`, 2)
    return found
  }
  return (
    workspace.rolls.find((r) => r.id === workspace.activeRollId && !r.archived) ??
    workspace.rolls.find((r) => !r.archived) ??
    workspace.rolls[0]!
  )
}

function visibleRolls(workspace: Workspace): Roll[] {
  return workspace.rolls
    .filter((r) => !r.archived)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function fillBody(lines: string[], rows: number): void {
  while (lines.length < rows - 1) lines.push('')
  if (lines.length > rows - 1) lines.length = rows - 1
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
