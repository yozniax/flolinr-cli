import type { OutlineDocument, OutlineMeta, OutlineNode, NodeBlock } from '../types.js'
import { isBlockKind } from './blockMeta.js'
import { clampFontScale, DEFAULT_FONT_SCALE } from './fontScale.js'
import { createId } from './id.js'

/** Column order: order, text, timestamp, id, ... */
const HEADER = [
  'order',
  'text',
  'timestamp',
  'id',
  'parent_id',
  'updated_at',
  'collapsed',
  'bold',
  'strike',
  'underline',
  'font_scale',
  'block_kind',
  'block_lang',
  'block_content',
  'block_checked',
  'block_pinned',
] as const

function encodeMultiline(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
}

function decodeMultiline(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '\\' && i + 1 < value.length) {
      const next = value[i + 1]
      if (next === 'n') {
        out += '\n'
        i += 1
        continue
      }
      if (next === 'r') {
        out += '\r'
        i += 1
        continue
      }
      if (next === '\\') {
        out += '\\'
        i += 1
        continue
      }
    }
    out += value[i]
  }
  return out
}

function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

function unescapeCell(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replaceAll('""', '"')
  }
  return raw
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

function splitTsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === '\t') {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

function parseBlock(
  kindRaw: string | undefined,
  langRaw: string | undefined,
  contentRaw: string | undefined,
  checkedRaw?: string,
  pinnedRaw?: string,
): NodeBlock | null {
  if (!kindRaw || !isBlockKind(kindRaw)) return null
  return {
    kind: kindRaw,
    language: langRaw?.trim() ? langRaw.trim() : null,
    content: decodeMultiline(contentRaw ?? ''),
    checked: checkedRaw === '1' || checkedRaw === 'true',
    pinned: pinnedRaw === '1' || pinnedRaw === 'true',
  }
}

export function serializeDocument(doc: OutlineDocument): string {
  const lines = [HEADER.join(',')]
  const sorted = [...doc.nodes].sort((a, b) => {
    if (a.parentId === b.parentId) return a.order - b.order
    return a.id.localeCompare(b.id)
  })

  for (const node of sorted) {
    lines.push(
      [
        String(node.order),
        escapeCell(node.text),
        node.createdAt,
        node.id,
        node.parentId ?? '',
        node.updatedAt,
        node.collapsed ? '1' : '0',
        node.bold ? '1' : '0',
        node.strike ? '1' : '0',
        node.underline ? '1' : '0',
        String(DEFAULT_FONT_SCALE),
        node.block?.kind ?? '',
        node.block?.language ?? '',
        escapeCell(encodeMultiline(node.block?.content ?? '')),
        node.block?.checked ? '1' : '0',
        node.block?.pinned ? '1' : '0',
      ].join(','),
    )
  }

  lines.push(`# last_edited_id,${doc.meta.lastEditedId ?? ''}`)
  lines.push(`# schema_version,${doc.meta.schemaVersion}`)

  return `${lines.join('\n')}\n`
}

function parseMetaLine(line: string, meta: OutlineMeta): OutlineMeta {
  const body = line.slice(2).trim()
  const sep = body.includes('\t') ? '\t' : ','
  const [key, ...rest] = body.split(sep)
  const value = rest.join(sep)
  if (key === 'last_edited_id') {
    return { ...meta, lastEditedId: value || null }
  }
  if (key === 'schema_version') {
    return { ...meta, schemaVersion: 1 }
  }
  return meta
}

function parseCsvRow(cells: string[]): OutlineNode | null {
  const [
    orderRaw,
    text,
    timestamp,
    id,
    parentIdRaw,
    updatedAt,
    collapsedRaw,
    boldRaw,
    strikeOrFont,
    underlineOrFont,
    maybeFont,
    maybeBlockKind,
    maybeBlockLang,
    maybeBlockContent,
    maybeBlockChecked,
  ] = cells
  if (!id) return null
  const createdAt = timestamp || new Date().toISOString()

  let strike = false
  let underline = false
  let fontScaleRaw: string | undefined
  let blockKind: string | undefined
  let blockLang: string | undefined
  let blockContent: string | undefined
  let blockChecked: string | undefined
  let blockPinned: string | undefined

  if (
    maybeBlockContent !== undefined ||
    (maybeBlockKind !== undefined && isBlockKind(maybeBlockKind))
  ) {
    strike = strikeOrFont === '1' || strikeOrFont === 'true'
    underline = underlineOrFont === '1' || underlineOrFont === 'true'
    fontScaleRaw = maybeFont
    blockKind = maybeBlockKind
    blockLang = maybeBlockLang
    blockContent = maybeBlockContent ?? ''
    blockChecked = maybeBlockChecked
    blockPinned = cells[15]
  } else if (maybeFont !== undefined) {
    strike = strikeOrFont === '1' || strikeOrFont === 'true'
    underline = underlineOrFont === '1' || underlineOrFont === 'true'
    fontScaleRaw = maybeFont
  } else if (underlineOrFont !== undefined) {
    fontScaleRaw = strikeOrFont
  } else {
    fontScaleRaw = strikeOrFont
  }

  return {
    id,
    parentId: parentIdRaw ? parentIdRaw : null,
    order: Number(orderRaw) || 0,
    text: text ?? '',
    createdAt,
    updatedAt: updatedAt || createdAt,
    collapsed: collapsedRaw === '1' || collapsedRaw === 'true',
    bold: boldRaw === '1' || boldRaw === 'true',
    strike,
    underline,
    fontScale: clampFontScale(
      fontScaleRaw === undefined || fontScaleRaw === ''
        ? DEFAULT_FONT_SCALE
        : Number(fontScaleRaw),
    ),
    block: parseBlock(
      blockKind,
      blockLang,
      blockContent,
      blockChecked,
      blockPinned,
    ),
  }
}

function parseLegacyTsvRow(cells: string[]): OutlineNode | null {
  const [id, parentIdRaw, orderRaw, text, createdAt, updatedAt, collapsedRaw] =
    cells
  if (!id) return null
  const created = createdAt || new Date().toISOString()
  return {
    id,
    parentId: parentIdRaw ? parentIdRaw : null,
    order: Number(orderRaw) || 0,
    text: text ?? '',
    createdAt: created,
    updatedAt: updatedAt || created,
    collapsed: collapsedRaw === '1' || collapsedRaw === 'true',
    bold: false,
    strike: false,
    underline: false,
    fontScale: DEFAULT_FONT_SCALE,
    block: null,
  }
}

export function parseDocument(raw: string): OutlineDocument {
  const nodes: OutlineNode[] = []
  let meta: OutlineMeta = { lastEditedId: null, schemaVersion: 1 }

  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/)
  let headerSeen = false
  let mode: 'csv' | 'tsv' | null = null

  for (const line of lines) {
    if (!line.trim()) continue

    if (line.startsWith('# ') || line.startsWith('#')) {
      const normalized = line.startsWith('# ') ? line : `# ${line.slice(1)}`
      meta = parseMetaLine(normalized, meta)
      continue
    }

    if (!headerSeen) {
      headerSeen = true
      if (line.includes('\t') && line.startsWith('id')) {
        mode = 'tsv'
        continue
      }
      if (line.startsWith('order,') || line.startsWith('order\t')) {
        mode = line.includes('\t') && !line.includes(',') ? 'tsv' : 'csv'
        continue
      }
      mode = line.includes('\t') && !line.includes(',') ? 'tsv' : 'csv'
    }

    if (mode === 'tsv') {
      const cells = splitTsvLine(line).map(unescapeCell)
      if (cells[0] === 'id') continue
      const node = parseLegacyTsvRow(cells)
      if (node) nodes.push(node)
    } else {
      const cells = splitCsvLine(line).map(unescapeCell)
      if (cells[0] === 'order') continue
      const node = parseCsvRow(cells)
      if (node) nodes.push(node)
    }
  }

  return { nodes, meta }
}

export function createEmptyDocument(): OutlineDocument {
  const now = new Date().toISOString()
  const id = createId()
  return {
    nodes: [
      {
        id,
        parentId: null,
        order: 0,
        text: '',
        createdAt: now,
        updatedAt: now,
        collapsed: false,
        bold: false,
        strike: false,
        underline: false,
        fontScale: DEFAULT_FONT_SCALE,
        block: null,
      },
    ],
    meta: { lastEditedId: null, schemaVersion: 1 },
  }
}
