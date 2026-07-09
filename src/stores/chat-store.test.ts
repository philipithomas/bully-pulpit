import type { UIMessage } from 'ai'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  isScriptedChatMessage,
  SUBSCRIBER_WELCOME_MESSAGE,
  SUBSCRIBER_WELCOME_METADATA,
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
    expect(isScriptedChatMessage(MESSAGE)).toBe(false)
    expect(state.syncConversationIdentity('subscriber:new-reader')).toBe(false)
    expect(useChatSidebar.getState().savedMessages).toHaveLength(1)

    state.consumePendingLocalMessage(state.chatId)
    expect(useChatSidebar.getState().pendingLocalMessage).toBeNull()
  })
})

afterAll(() => {
  warn.mockRestore()
})
