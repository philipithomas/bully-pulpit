import type { UIMessage } from 'ai'

export const MAX_CHAT_MESSAGES = 40
export const MAX_CHAT_PARTS_PER_MESSAGE = 16
export const MAX_CHAT_REQUEST_MESSAGES = 100
export const MAX_CHAT_REQUEST_PARTS_PER_MESSAGE = 100
export const MAX_CHAT_TEXT_PART_CHARACTERS = 8_000
export const MAX_CHAT_MESSAGE_CHARACTERS = 16_000
export const MAX_CHAT_CONTEXT_CHARACTERS = 48_000
export const MAX_CHAT_IDENTIFIER_CHARACTERS = 200

type SanitizedPart = UIMessage['parts'][number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Rebuilds attacker-controlled browser history as bounded text-only messages.
 * Tool calls and results are server-derived state, but accepting replayed
 * copies lets a client inject arbitrary provider context. The newest useful
 * messages win when the aggregate context budget is exhausted.
 */
export function sanitizeChatMessages(messages: unknown[]): UIMessage[] {
  const newestFirst: UIMessage[] = []
  let remainingContextCharacters = MAX_CHAT_CONTEXT_CHARACTERS

  for (
    let index = messages.length - 1, inspectedMessages = 0;
    index >= 0 &&
    inspectedMessages < MAX_CHAT_REQUEST_MESSAGES &&
    newestFirst.length < MAX_CHAT_MESSAGES &&
    remainingContextCharacters > 0;
    index--, inspectedMessages++
  ) {
    const message = messages[index]
    if (!isRecord(message)) continue
    const role = message.role
    if (role !== 'user' && role !== 'assistant') continue
    if (!Array.isArray(message.parts)) continue

    const parts: SanitizedPart[] = []
    let remainingMessageCharacters = Math.min(
      MAX_CHAT_MESSAGE_CHARACTERS,
      remainingContextCharacters
    )
    for (const part of message.parts.slice(
      0,
      MAX_CHAT_REQUEST_PARTS_PER_MESSAGE
    )) {
      if (parts.length === MAX_CHAT_PARTS_PER_MESSAGE) break
      if (!isRecord(part) || part.type !== 'text') continue
      if (typeof part.text !== 'string' || part.text.length === 0) continue
      const characterLimit = Math.min(
        MAX_CHAT_TEXT_PART_CHARACTERS,
        remainingMessageCharacters
      )
      if (characterLimit === 0) break
      const text = part.text.slice(0, characterLimit)
      parts.push({ type: 'text', text })
      remainingMessageCharacters -= text.length
      if (remainingMessageCharacters === 0) break
    }
    if (parts.length === 0) continue

    const usedCharacters = parts.reduce(
      (total, part) =>
        part.type === 'text' ? total + part.text.length : total,
      0
    )
    remainingContextCharacters -= usedCharacters
    const id =
      typeof message.id === 'string' && message.id.length > 0
        ? message.id.slice(0, MAX_CHAT_IDENTIFIER_CHARACTERS)
        : `sanitized-${index}`
    newestFirst.push({ id, role, parts })
  }

  return newestFirst.reverse()
}
