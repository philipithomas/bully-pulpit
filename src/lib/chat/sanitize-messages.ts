import type { UIMessage } from 'ai'

/**
 * The chat client replays its full message history from sessionStorage, so
 * the request body is attacker-controlled. convertToModelMessages converts a
 * crafted { role: 'system' } message into a real system message, and it
 * copies providerMetadata fields from parts into provider options. This
 * rebuilds the history from only the shapes the Bell client can legitimately
 * produce: user and assistant roles, text and step-start parts, and completed
 * calls to the known Bell tools. Everything else is dropped, including
 * messages left with no parts.
 */

const TOOL_PART_TYPES = new Set([
  'tool-searchPosts',
  'tool-fetchPost',
  'tool-fetchPage',
])
const MAX_TEXT_CHARACTERS = 16_000
const MAX_TOOL_PART_BYTES = 64_000
const MAX_MESSAGE_PARTS_JSON_BYTES = 64_000
const MAX_IDENTIFIER_CHARACTERS = 200
const MAX_PARTS_PER_MESSAGE = 100

type SanitizedPart = UIMessage['parts'][number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sanitizeTextPart(part: Record<string, unknown>): SanitizedPart | null {
  if (typeof part.text !== 'string') return null
  return { type: 'text', text: part.text.slice(0, MAX_TEXT_CHARACTERS) }
}

function sanitizeToolPart(part: Record<string, unknown>): SanitizedPart | null {
  if (typeof part.toolCallId !== 'string' || part.toolCallId.length === 0) {
    return null
  }
  const toolCallId = part.toolCallId.slice(0, MAX_IDENTIFIER_CHARACTERS)
  try {
    if (
      Buffer.byteLength(
        JSON.stringify({ input: part.input, output: part.output }),
        'utf8'
      ) > MAX_TOOL_PART_BYTES
    ) {
      return null
    }
  } catch {
    return null
  }
  const type = part.type as `tool-${string}`
  // Only completed calls appear in replayed history. Streaming, approval,
  // and provider-executed states are not shapes this client produces.
  if (part.state === 'output-available') {
    return {
      type,
      toolCallId,
      state: 'output-available',
      input: part.input,
      output: part.output,
    }
  }
  if (part.state === 'output-error' && typeof part.errorText === 'string') {
    return {
      type,
      toolCallId,
      state: 'output-error',
      input: part.input,
      errorText: part.errorText.slice(0, MAX_TEXT_CHARACTERS),
    }
  }
  return null
}

function sanitizePart(
  part: unknown,
  role: 'user' | 'assistant'
): SanitizedPart | null {
  if (!isRecord(part) || typeof part.type !== 'string') return null
  if (part.type === 'text') return sanitizeTextPart(part)
  if (role !== 'assistant') return null
  if (part.type === 'step-start') return { type: 'step-start' }
  if (TOOL_PART_TYPES.has(part.type)) return sanitizeToolPart(part)
  return null
}

export function sanitizeChatMessages(messages: unknown[]): UIMessage[] {
  const sanitized: UIMessage[] = []
  for (const [index, message] of messages.entries()) {
    if (!isRecord(message)) continue
    const role = message.role
    if (role !== 'user' && role !== 'assistant') continue
    if (!Array.isArray(message.parts)) continue
    const parts: SanitizedPart[] = []
    // Account for the surrounding JSON array and commas between parts.
    let partsBytes = 2
    for (const rawPart of message.parts.slice(0, MAX_PARTS_PER_MESSAGE)) {
      const part = sanitizePart(rawPart, role)
      if (!part) continue
      const partBytes = Buffer.byteLength(JSON.stringify(part), 'utf8')
      const separatorBytes = parts.length > 0 ? 1 : 0
      if (
        partsBytes + separatorBytes + partBytes >
        MAX_MESSAGE_PARTS_JSON_BYTES
      ) {
        break
      }
      parts.push(part)
      partsBytes += separatorBytes + partBytes
    }
    if (parts.length === 0) continue
    const id =
      typeof message.id === 'string' && message.id.length > 0
        ? message.id.slice(0, MAX_IDENTIFIER_CHARACTERS)
        : `sanitized-${index}`
    sanitized.push({
      id,
      role,
      parts,
    })
  }
  return sanitized
}
