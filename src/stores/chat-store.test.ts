import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createBellChat } from '@/lib/chat/bell-chat'
import {
  isScriptedChatMessage,
  SUBSCRIBER_WELCOME_MESSAGE,
  SUBSCRIBER_WELCOME_METADATA,
  scriptedChatMessageShowsStarterPrompts,
  useChatSidebar,
} from '@/stores/chat-store'

const MESSAGE: UIMessage = {
  id: 'message-1',
  role: 'user',
  parts: [{ type: 'text', text: 'A prior question' }],
}

let warn: ReturnType<typeof vi.spyOn>

beforeAll(() => {
  // The store intentionally falls back to in-memory state during this Node
  // test because sessionStorage exists only in the browser.
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

beforeEach(() => {
  useChatSidebar.setState({
    ...useChatSidebar.getInitialState(),
    chatId: crypto.randomUUID(),
  })
})

describe('Bell chat boundaries', () => {
  it('starts every search handoff with a fresh durable conversation', () => {
    const previousId = useChatSidebar.getState().chatId
    useChatSidebar.setState({
      conversationIdentity: 'subscriber:reader-a',
      savedMessages: [MESSAGE],
    })

    useChatSidebar.getState().openSidebar('Photos of coffee')

    const handoff = useChatSidebar.getState()
    expect(handoff.chatId).not.toBe(previousId)
    expect(handoff.savedMessages).toEqual([])
    expect(handoff.initialQuery).toBe('Photos of coffee')
    expect(handoff.entrySource).toBe('search')

    // A response finishing from the chat that the handoff replaced cannot
    // repopulate the fresh conversation with stale history.
    handoff.saveMessages(previousId, [MESSAGE])
    expect(useChatSidebar.getState().savedMessages).toEqual([])

    const handoffId = handoff.chatId
    handoff.openSidebar()
    expect(useChatSidebar.getState().chatId).toBe(handoffId)
  })

  it('keeps an in-flight finish bound to its originating chat', async () => {
    let releaseStream: () => void = () => {}
    const streamReady = new Promise<void>((resolve) => {
      releaseStream = resolve
    })
    const sendMessages = vi.fn(async () => {
      await streamReady
      const chunks: UIMessageChunk[] = [
        {
          type: 'start',
          messageId: 'assistant-finished',
          messageMetadata: {
            currentPageSource: {
              type: 'page',
              title: 'Contact',
              url: '/contact',
              publishedAt: null,
              newsletter: 'page',
            },
          },
        },
        { type: 'text-start', id: 'answer' },
        {
          type: 'text-delta',
          id: 'answer',
          delta: 'The finished answer.',
        },
        { type: 'text-end', id: 'answer' },
        { type: 'finish', finishReason: 'stop' },
      ]
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk)
          controller.close()
        },
      })
    })
    const transport: ChatTransport<UIMessage> = {
      sendMessages,
      reconnectToStream: async () => null,
    }
    const originalChatId = useChatSidebar.getState().chatId
    const saveMessages = vi.fn(useChatSidebar.getState().saveMessages)
    const originalChat = createBellChat({
      chatId: originalChatId,
      transport,
      onFinish: ({ chatId, messages }) => saveMessages(chatId, messages),
    })

    const oldCompletion = originalChat.sendMessage({ text: 'Old question' })
    await vi.waitFor(() => expect(sendMessages).toHaveBeenCalledOnce())

    useChatSidebar.getState().openSidebar('New question')
    const newChatId = useChatSidebar.getState().chatId
    const newSnapshot: UIMessage[] = [
      {
        id: 'new-question',
        role: 'user',
        parts: [{ type: 'text', text: 'New question' }],
      },
    ]
    useChatSidebar.getState().saveMessages(newChatId, newSnapshot)

    releaseStream()
    await oldCompletion

    expect(saveMessages).toHaveBeenCalledOnce()
    expect(saveMessages.mock.calls[0]?.[0]).toBe(originalChatId)
    expect(saveMessages.mock.calls[0]?.[1][1]?.metadata).toEqual({
      currentPageSource: {
        type: 'page',
        title: 'Contact',
        url: '/contact',
        publishedAt: null,
        newsletter: 'page',
      },
    })
    expect(useChatSidebar.getState().chatId).toBe(newChatId)
    expect(useChatSidebar.getState().savedMessages).toBe(newSnapshot)
  })

  it('rotates and clears only when the resolved auth identity changes', () => {
    const initialId = useChatSidebar.getState().chatId
    expect(
      useChatSidebar.getState().syncConversationIdentity('subscriber:reader-a')
    ).toBe(false)
    expect(useChatSidebar.getState().chatId).toBe(initialId)

    useChatSidebar.setState({ savedMessages: [MESSAGE] })
    expect(
      useChatSidebar.getState().syncConversationIdentity('subscriber:reader-a')
    ).toBe(false)
    expect(useChatSidebar.getState().savedMessages).toEqual([MESSAGE])

    expect(
      useChatSidebar.getState().syncConversationIdentity('subscriber:reader-b')
    ).toBe(true)
    const switched = useChatSidebar.getState()
    expect(switched.chatId).not.toBe(initialId)
    expect(switched.savedMessages).toEqual([])

    const switchedId = switched.chatId
    useChatSidebar.setState({ savedMessages: [MESSAGE] })
    expect(
      useChatSidebar.getState().syncConversationIdentity('anonymous')
    ).toBe(true)
    expect(useChatSidebar.getState().chatId).not.toBe(switchedId)
    expect(useChatSidebar.getState().savedMessages).toEqual([])
  })

  it('opens a fresh thread with a local assistant welcome and no query', () => {
    const previousId = useChatSidebar.getState().chatId
    const stoppedChatIds: string[] = []
    useChatSidebar.setState({
      conversationIdentity: 'anonymous',
      savedMessages: [MESSAGE],
    })
    useChatSidebar
      .getState()
      .setActiveChatStop(() =>
        stoppedChatIds.push(useChatSidebar.getState().chatId)
      )

    useChatSidebar
      .getState()
      .openSidebarWithLocalMessage(SUBSCRIBER_WELCOME_MESSAGE, {
        conversationIdentity: 'subscriber:new-reader',
        entrySource: 'onboarding',
      })

    const state = useChatSidebar.getState()
    expect(stoppedChatIds).toEqual([previousId])
    expect(state.open).toBe(true)
    expect(state.hasOpened).toBe(true)
    expect(state.chatId).not.toBe(previousId)
    expect(state.initialQuery).toBe('')
    expect(state.entrySource).toBe('onboarding')
    expect(state.conversationIdentity).toBe('subscriber:new-reader')
    expect(state.savedMessages).toHaveLength(1)
    expect(state.pendingLocalMessage).toEqual(state.savedMessages[0])
    expect(state.savedMessages[0]).toMatchObject({
      role: 'assistant',
      metadata: SUBSCRIBER_WELCOME_METADATA,
      parts: [{ type: 'text', text: SUBSCRIBER_WELCOME_MESSAGE }],
    })
    expect(isScriptedChatMessage(state.savedMessages[0])).toBe(true)
    expect(scriptedChatMessageShowsStarterPrompts(state.savedMessages[0])).toBe(
      true
    )
    expect(isScriptedChatMessage(MESSAGE)).toBe(false)
    expect(scriptedChatMessageShowsStarterPrompts(MESSAGE)).toBe(false)
    expect(state.syncConversationIdentity('subscriber:new-reader')).toBe(false)
    expect(useChatSidebar.getState().savedMessages).toHaveLength(1)

    state.consumePendingLocalMessage(state.chatId)
    expect(useChatSidebar.getState().pendingLocalMessage).toBeNull()
  })
})

afterAll(() => {
  warn.mockRestore()
})
