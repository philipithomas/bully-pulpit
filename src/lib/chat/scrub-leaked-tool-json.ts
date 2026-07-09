/**
 * Some models emit unbound Bell tool inputs as visible leading JSON. The
 * model has changed since this was first observed, but every current Bell
 * tool shape stays covered so a provider regression cannot reach visitors.
 */
const TOOL_INPUT_KEYS = new Set(['query', 'scope', 'slug', 'path'])
const TOOL_IDENTITY_KEYS = new Set(['query', 'slug', 'path'])

function jsonObjectEnd(value: string, start: number): number | null {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < value.length; index++) {
    const character = value[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
    } else if (character === '{') {
      depth++
    } else if (character === '}') {
      depth--
      if (depth === 0) return index + 1
    }
  }

  return null
}

function isBellToolInput(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false
    }
    const keys = Object.keys(parsed)
    return (
      keys.length > 0 &&
      keys.every((key) => TOOL_INPUT_KEYS.has(key)) &&
      keys.some((key) => TOOL_IDENTITY_KEYS.has(key))
    )
  } catch {
    return false
  }
}

/** Strips only a leading run of known Bell tool-input objects. */
export function scrubLeakedToolJson(text: string): string {
  let cursor = 0
  let removed = false

  while (cursor < text.length) {
    const objectStart = cursor
    while (/\s/.test(text[cursor] ?? '')) cursor++
    if (text[cursor] !== '{') {
      if (!removed) return text
      return text.slice(cursor)
    }

    const objectEnd = jsonObjectEnd(text, cursor)
    if (!objectEnd || !isBellToolInput(text.slice(cursor, objectEnd))) {
      return removed ? text.slice(objectStart).trimStart() : text
    }
    removed = true
    cursor = objectEnd
  }

  return removed ? '' : text
}
