import type { TextMessage } from '@/lib/db/schema'

/** Wire shape of a text message: dates as ISO strings. */
export type SerializedMessage = {
  id: number
  fromNumber: string
  toNumber: string
  body: string
  direction: string
  status: string
  createdAt: string
}

/** Normalizes a DB row to the wire shape shared by SSR props and JSON APIs. */
export function serializeMessage(message: TextMessage): SerializedMessage {
  return {
    id: message.id,
    fromNumber: message.fromNumber,
    toNumber: message.toNumber,
    body: message.body,
    direction: message.direction,
    status: message.status,
    createdAt: message.createdAt.toISOString(),
  }
}
