import { Chat } from '@ai-sdk/react'
import type { ChatOnFinishCallback, ChatTransport, UIMessage } from 'ai'

type BellChatFinishEvent = Parameters<ChatOnFinishCallback<UIMessage>>[0] & {
  chatId: string
}

export function createBellChat({
  chatId,
  transport,
  onFinish,
}: {
  chatId: string
  transport: ChatTransport<UIMessage>
  onFinish: (event: BellChatFinishEvent) => void
}) {
  return new Chat<UIMessage>({
    id: chatId,
    transport,
    // Bind the durable ID to the Chat instance. An older request may finish
    // after the UI has rotated to a new conversation, and its callback must
    // still persist against the ID that originated that request.
    onFinish: (event) => onFinish({ ...event, chatId }),
  })
}
