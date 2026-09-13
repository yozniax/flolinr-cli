export function chars(text: string): string[] {
  return [...text]
}

export function cellWidth(cp: number): number {
  if (cp === 0) return 0
  if (cp < 32 || cp === 0x7f) return 0
  if (isCombining(cp)) return 0
  return isWide(cp) ? 2 : 1
}

function isCombining(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  )
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff)
  )
}

/** Skip CSI / simple ESC sequences so width is visual cells only. */
export function visibleChars(text: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const code = text.charCodeAt(i)
    if (code === 0x1b) {
      i += 1
      if (text[i] === '[') {
        i += 1
        while (i < text.length) {
          const c = text.charCodeAt(i)
          i += 1
          if (c >= 0x40 && c <= 0x7e) break
        }
      } else if (i < text.length) {
        i += 1
      }
      continue
    }
    const cp = text.codePointAt(i)
    if (cp === undefined) break
    out.push(String.fromCodePoint(cp))
    i += cp > 0xffff ? 2 : 1
  }
  return out
}

export function displayWidth(text: string): number {
  let w = 0
  for (const ch of visibleChars(text)) {
    w += cellWidth(ch.codePointAt(0)!)
  }
  return w
}

export function sliceWidth(text: string, max: number): string {
  let w = 0
  let out = ''
  for (const ch of visibleChars(text)) {
    const add = cellWidth(ch.codePointAt(0)!)
    if (add <= 0) continue
    if (w + add > max) break
    out += ch
    w += add
  }
  return out
}

/** Pad or clip so the string occupies exactly `cols` terminal cells. */
export function padCells(text: string, cols: number): string {
  const clipped = sliceWidth(text.replace(/\n/g, ''), cols)
  const pad = Math.max(0, cols - displayWidth(clipped))
  return `${clipped}${' '.repeat(pad)}`
}
