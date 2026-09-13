export type ParsedLine =
  | { type: 'todo'; checked: boolean; body: string }
  | { type: 'quote'; body: string }
  | { type: 'plain'; body: string }

export function parseLineMarker(text: string): ParsedLine {
  const checked = text.match(/^\[[xX]\]\s?(.*)$/s)
  if (checked) {
    return { type: 'todo', checked: true, body: checked[1] ?? '' }
  }

  const unchecked = text.match(/^\[\]\s?(.*)$/s)
  if (unchecked) {
    return { type: 'todo', checked: false, body: unchecked[1] ?? '' }
  }

  if (text.startsWith('>')) {
    return { type: 'quote', body: text.slice(1).replace(/^\s/, '') }
  }

  return { type: 'plain', body: text }
}

export function displayLineText(text: string): string {
  const parsed = parseLineMarker(text)
  if (parsed.type === 'plain') return text
  return parsed.body
}
