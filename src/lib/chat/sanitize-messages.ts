import type { UIMessage } from 'ai'

/**
 * The chat client replays its full message history from sessionStorage, so
 * the request body is attacker-controlled. convertToModelMessages converts a
 * crafted { role: 'system' } message into a real system message, and it
 * copies providerMetadata fields from parts into provider options. This
 * rebuilds the history from only the shapes the Bell client can legitimately
 * produce: user and assistant roles, text and step-start parts, and completed
 * calls to the two known tools. Everything else is dropped, including
 * messages left with no parts.
 */

const TOOL_PART_TYPES = new Set(['tool-searchPosts', 'tool-fetchPost'])

type SanitizedPart = UIMessage['parts'][number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sanitizeTextPart(part: Record<string, unknown>): SanitizedPart | null {
  if (typeof part.text !== 'string') return null
  return { type: 'text', text: part.text }
}

function sanitizeToolPart(part: Record<string, unknown>): SanitizedPart | null {
  if (typeof part.toolCallId !== 'string') return null
  const type = part.type as `tool-${string}`
  // Only completed calls appear in replayed history. Streaming, approval,
  // and provider-executed states are not shapes this client produces.
  if (part.state === 'output-available') {
    return {
      type,
      toolCallId: part.toolCallId,
      state: 'output-available',
      input: part.input,
      output: part.output,
    }
  }
  if (part.state === 'output-error' && typeof part.errorText === 'string') {
    return {
      type,
      toolCallId: part.toolCallId,
      state: 'output-error',
      input: part.input,
      errorText: part.errorText,
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
    const parts = message.parts
      .map((part) => sanitizePart(part, role))
      .filter((part) => part !== null)
    if (parts.length === 0) continue
    sanitized.push({
      id: typeof message.id === 'string' ? message.id : `sanitized-${index}`,
      role,
      parts,
    })
  }
  return sanitized
}
