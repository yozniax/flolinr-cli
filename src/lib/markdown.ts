import type { NodeBlock, OutlineDocument, OutlineNode } from '../types.js'
import { createEmptyDocument } from './csv.js'
import { DEFAULT_FONT_SCALE } from './fontScale.js'
import { createId } from './id.js'
import { defaultBlockName } from './nodeDefaults.js'
import { parseLineMarker } from './lineMarkers.js'
import { siblingsOf } from './outlineTree.js'

type StackEntry = { id: string; depth: number }

type InlineAttrs = {
  text: string
  bold: boolean
  strike: boolean
  inlineCode: string | null
}

function leadingIndent(line: string): number {
  let n = 0
  for (const ch of line) {
    if (ch === ' ') n += 1
    else if (ch === '\t') n += 2
    else break
  }
  return n
}

function stripHtml(text: string): string {
  return text.replace(/<\/?[^>]+>/g, '')
}

export function stripInlineMarkdown(raw: string): InlineAttrs {
  let t = raw.trim()
  let bold = false
  let strike = false

  const wholeCode = /^`([^`]+)`$/.exec(t)
  if (wholeCode) {
    return { text: '', bold: false, strike: false, inlineCode: wholeCode[1] }
  }

  const wholeBoldStar = /^\*\*(.+)\*\*$/.exec(t)
  const wholeBoldUnder = /^__(.+)__$/.exec(t)
  if (wholeBoldStar && !wholeBoldStar[1].includes('**')) {
    bold = true
    t = wholeBoldStar[1]
  } else if (wholeBoldUnder && !wholeBoldUnder[1].includes('__')) {
    bold = true
    t = wholeBoldUnder[1]
  }

  const wholeStrike = /^~~(.+)~~$/.exec(t)
  if (wholeStrike && !wholeStrike[1].includes('~~')) {
    strike = true
    t = wholeStrike[1]
  }

  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, url) =>
    [alt, url].filter(Boolean).join(' '),
  )
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '$1 $2')
  t = t.replace(/`([^`]+)`/g, '$1')
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1')
  t = t.replace(/__([^_]+)__/g, '$1')
  t = t.replace(/\*([^*]+)\*/g, '$1')
  t = t.replace(/~~([^~]+)~~/g, '$1')
  t = stripHtml(t)
  t = t.replace(/\s+/g, ' ').trim()

  return { text: t, bold, strike, inlineCode: null }
}

function isHorizontalRule(line: string): boolean {
  return /^(?:-{3,}|\*{3,}|_{3,})$/.test(line.trim())
}

function parseHeading(line: string): { level: number; text: string } | null {
  const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
  if (!m) return null
  return { level: m[1].length, text: m[2] }
}

function parseListItem(line: string): { indent: number; text: string } | null {
  const indent = leadingIndent(line)
  const body = line.slice(line.search(/\S|$/))
  const task = /^([-*+])\s+\[[ xX]\]\s+(.*)$/.exec(body)
  if (task) return { indent, text: task[2] }
  const ul = /^([-*+])\s+(.*)$/.exec(body)
  if (ul) return { indent, text: ul[2] }
  const ol = /^(\d+)\.\s+(.*)$/.exec(body)
  if (ol) return { indent, text: ol[2] }
  return null
}

function flattenTableRow(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return null
  if (/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(trimmed)) return null
  if (!trimmed.startsWith('|') && trimmed.split('|').length < 2) return null
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean)
  if (cells.length === 0) return null
  return cells.join(' | ')
}

function parseFenceOpen(
  line: string,
): { marker: string; language: string | null } | null {
  const m = /^(```|~~~)\s*([^\s`]*)?\s*$/.exec(line.trim())
  if (!m) return null
  return { marker: m[1], language: m[2]?.trim() || null }
}

export function markdownToDocument(markdown: string): OutlineDocument {
  const now = new Date().toISOString()
  const nodes: OutlineNode[] = []
  const stack: StackEntry[] = []
  let headingDepth = -1
  let skipFrontMatter = false
  let frontMatterChecked = false

  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n')

  function siblingOrder(parentId: string | null): number {
    return nodes.filter((n) => n.parentId === parentId).length
  }

  function addNode(
    depth: number,
    rawText: string,
    opts?: { block?: NodeBlock | null; title?: string },
  ): OutlineNode | null {
    const inline = stripInlineMarkdown(rawText)

    let block = opts?.block ?? null
    let title = opts?.title
    let bold = inline.bold
    let strike = inline.strike

    if (!block && inline.inlineCode !== null) {
      block = {
        kind: 'code',
        language: null,
        content: inline.inlineCode,
        checked: false,
        pinned: false,
      }
      title = title ?? defaultBlockName('code', null, inline.inlineCode)
    }

    const text = title ?? inline.text
    if (!text && !block) return null

    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
      stack.pop()
    }
    const parentId = stack.length > 0 ? stack[stack.length - 1]!.id : null
    const id = createId()
    const node: OutlineNode = {
      id,
      parentId,
      order: siblingOrder(parentId),
      text: text || defaultBlockName(block!.kind, block!.language, block!.content),
      createdAt: now,
      updatedAt: now,
      collapsed: false,
      bold,
      strike,
      underline: false,
      fontScale: DEFAULT_FONT_SCALE,
      block,
    }
    nodes.push(node)
    stack.push({ id, depth })
    return node
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!

    if (!frontMatterChecked && i === 0 && line.trim() === '---') {
      skipFrontMatter = true
      frontMatterChecked = true
      continue
    }
    if (skipFrontMatter) {
      if (line.trim() === '---') skipFrontMatter = false
      continue
    }
    frontMatterChecked = true

    const trimmed = line.trim()
    const fence = parseFenceOpen(trimmed)
    if (fence) {
      const body: string[] = []
      i += 1
      while (i < lines.length) {
        const close = lines[i]!.trim()
        if (close === fence.marker || close.startsWith(fence.marker)) break
        body.push(lines[i]!)
        i += 1
      }
      const content = body.join('\n')
      const depth = Math.max(0, headingDepth + 1)
      const name = defaultBlockName('code', fence.language, content)
      addNode(depth, name, {
        title: name,
        block: {
          kind: 'code',
          language: fence.language,
          content,
          checked: false,
          pinned: false,
        },
      })
      continue
    }

    if (!trimmed) continue
    if (isHorizontalRule(trimmed)) continue

    const heading = parseHeading(trimmed)
    if (heading) {
      const depth = Math.min(5, Math.max(0, heading.level - 1))
      headingDepth = depth
      addNode(depth, heading.text)
      continue
    }

    let contentLine = line
    if (/^\s*>/.test(contentLine)) {
      contentLine = contentLine.replace(/^(\s*>\s?)+/, '')
    }

    const list = parseListItem(contentLine)
    if (list) {
      const nestLevel = Math.floor(list.indent / 2)
      addNode(Math.max(0, headingDepth + 1 + nestLevel), list.text)
      continue
    }

    const table = flattenTableRow(trimmed)
    if (table) {
      addNode(Math.max(0, headingDepth + 1), table)
      continue
    }

    const depth = headingDepth >= 0 ? headingDepth + 1 : 0
    addNode(depth, contentLine.trim())
  }

  if (nodes.length === 0) return createEmptyDocument()

  return {
    nodes,
    meta: {
      lastEditedId: nodes[nodes.length - 1]?.id ?? null,
      schemaVersion: 1,
    },
  }
}

export function documentToMarkdown(doc: OutlineDocument): string {
  const lines: string[] = []

  function walk(parentId: string | null, depth: number) {
    for (const node of siblingsOf(doc.nodes, parentId)) {
      const indent = '  '.repeat(depth)
      const marker = parseLineMarker(node.text)
      if (marker.type === 'todo') {
        lines.push(
          `${indent}- [${marker.checked ? 'x' : ' '}] ${marker.body}`.trimEnd(),
        )
      } else if (node.text.trim() === '' && node.block?.content) {
        lines.push(`${indent}- ${node.block.kind}`)
      } else {
        lines.push(`${indent}- ${node.text}`)
      }
      walk(node.id, depth + 1)
    }
  }

  walk(null, 0)
  return lines.length > 0 ? `${lines.join('\n')}\n` : ''
}
