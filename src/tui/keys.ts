export type Key =
  | { type: 'char'; value: string }
  | { type: 'enter' }
  | { type: 'tab' }
  | { type: 'backtab' }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'pageup' }
  | { type: 'pagedown' }
  | { type: 'ctrl'; key: string }
  | { type: 'alt-up' }
  | { type: 'alt-down' }
  | { type: 'ctrl-up' }
  | { type: 'ctrl-down' }

export class KeyParser {
  private pending = Buffer.alloc(0)

  feed(chunk: Buffer): Key[] {
    this.pending = Buffer.concat([this.pending, chunk])
    const keys: Key[] = []
    while (this.pending.length > 0) {
      const used = this.take(keys)
      if (used === 0) break
      this.pending = this.pending.subarray(used)
    }
    return keys
  }

  private take(keys: Key[]): number {
    const buf = this.pending
    const b0 = buf[0]!

    if (b0 === 0x1b) return this.takeEscape(keys)
    if (b0 === 0x0d || b0 === 0x0a) {
      keys.push({ type: 'enter' })
      return 1
    }
    if (b0 === 0x09) {
      keys.push({ type: 'tab' })
      return 1
    }
    if (b0 === 0x7f || b0 === 0x08) {
      keys.push({ type: 'backspace' })
      return 1
    }
    if (b0 < 32) {
      if (b0 >= 1 && b0 <= 26) {
        keys.push({ type: 'ctrl', key: String.fromCharCode(96 + b0) })
      }
      return 1
    }

    let len = 1
    if (b0 >= 0xc0 && b0 < 0xe0) len = 2
    else if (b0 >= 0xe0 && b0 < 0xf0) len = 3
    else if (b0 >= 0xf0) len = 4
    if (buf.length < len) return 0
    keys.push({ type: 'char', value: buf.subarray(0, len).toString('utf8') })
    return len
  }

  private takeEscape(keys: Key[]): number {
    const buf = this.pending
    if (buf.length < 2) return 0

    if (buf[1] === 0x5b) {
      if (buf.length < 3) return 0
      if (buf[2] === 0x5a) {
        keys.push({ type: 'backtab' })
        return 3
      }
      let end = 2
      while (end < buf.length) {
        const b = buf[end]!
        if (b >= 0x40 && b <= 0x7e) break
        end += 1
      }
      if (end >= buf.length) return 0
      const seq = buf.subarray(2, end + 1).toString('ascii')
      const key = mapCsi(seq)
      if (key) keys.push(key)
      return end + 1
    }

    const next = buf[1]!
    if (next === 0x0d || next === 0x0a) {
      keys.push({ type: 'enter' })
      return 2
    }
    return 2
  }
}

function mapCsi(seq: string): Key | null {
  if (seq === '1;3A') return { type: 'alt-up' }
  if (seq === '1;5A') return { type: 'ctrl-up' }
  if (seq === '1;3B') return { type: 'alt-down' }
  if (seq === '1;5B') return { type: 'ctrl-down' }
  if (seq === 'A') return { type: 'up' }
  if (seq === 'B') return { type: 'down' }
  if (seq === 'C') return { type: 'right' }
  if (seq === 'D') return { type: 'left' }
  if (seq === 'H' || seq === '1~') return { type: 'home' }
  if (seq === 'F' || seq === '4~') return { type: 'end' }
  if (seq === '3~') return { type: 'delete' }
  if (seq === '5~') return { type: 'pageup' }
  if (seq === '6~') return { type: 'pagedown' }
  return null
}
