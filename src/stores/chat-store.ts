import type { UIMessage } from 'ai'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const SUBSCRIBER_WELCOME_MESSAGE =
  'Thanks for subscribing. I am the AI research assistant for this site. Try asking me about the archive anytime.'

export const SUBSCRIBER_WELCOME_METADATA = {
  provenance: 'scripted',
  kind: 'subscriber-welcome',
  showStarterPrompts: true,
} as const

export function isScriptedChatMessage(message: UIMessage): boolean {
  const metadata = message.metadata
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    'provenance' in metadata &&
    metadata.provenance === 'scripted'
  )
}

export function scriptedChatMessageShowsStarterPrompts(
  message: UIMessage
): boolean {
  if (!isScriptedChatMessage(message)) return false
  const metadata = message.metadata
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    'showStarterPrompts' in metadata &&
    metadata.showStarterPrompts === true
  )
}

interface ChatSidebarState {
  open: boolean
  // True once the sidebar has ever been opened — gates the lazy chat bundle
  // in the Header. Never reset so the mounted sidebar survives close.
  hasOpened: boolean
  pinned: boolean
  initialQuery: string
  entrySource: 'header' | 'search' | 'onboarding'
  savedMessages: UIMessage[]
  pendingLocalMessage: UIMessage | null
  // The mounted AI SDK Chat instance must be stopped before an action rotates
  // chatId. This callback is runtime-only and deliberately not persisted.
  activeChatStop: (() => void) | null
  chatId: string
  // The authenticated identity this browser conversation belongs to. Keep
  // this beside the persisted chat ID so a sign-out or account switch cannot
  // replay one person's transcript into another person's conversation.
  conversationIdentity: string | null
  openSidebar: (query?: string) => void
  openSidebarWithLocalMessage: (
    message: string,
    options: {
      conversationIdentity: string
      entrySource: 'onboarding'
    }
  ) => void
  closeSidebar: () => void
  togglePin: () => void
  setPinned: (pinned: boolean) => void
  setActiveChatStop: (stop: (() => void) | null) => void
  saveMessages: (chatId: string, messages: UIMessage[]) => void
  clearMessages: () => void
  consumePendingLocalMessage: (chatId: string) => void
  consumeInitialQuery: (chatId: string) => void
  syncConversationIdentity: (identity: string) => boolean
}

function generateChatId() {
  return crypto.randomUUID()
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isChatId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export const useChatSidebar = create<ChatSidebarState>()(
  persist(
    (set, get) => ({
      open: false,
      hasOpened: false,
      pinned: false,
      initialQuery: '',
      entrySource: 'header',
      savedMessages: [],
      pendingLocalMessage: null,
      activeChatStop: null,
      chatId: generateChatId(),
      conversationIdentity: null,
      openSidebar: (query?: string) => {
        const searchHandoff = Boolean(query)
        set({
          open: true,
          hasOpened: true,
          initialQuery: query ?? '',
          entrySource: searchHandoff ? 'search' : 'header',
          // Asking Bell from search deliberately presents a fresh thread.
          // Rotate the durable ID and clear both persisted and in-memory
          // history before the handoff can send its first message.
          ...(searchHandoff
            ? {
                savedMessages: [],
                pendingLocalMessage: null,
                chatId: generateChatId(),
              }
            : {}),
        })
      },
      openSidebarWithLocalMessage: (message, options) => {
        // useChat replaces its Chat instance as soon as chatId changes. Stop
        // the currently mounted instance while it is still addressable so a
        // stale stream cannot finish into the scripted welcome thread.
        get().activeChatStop?.()
        const localMessage: UIMessage = {
          id: `local-${crypto.randomUUID()}`,
          role: 'assistant',
          metadata: SUBSCRIBER_WELCOME_METADATA,
          parts: [{ type: 'text', text: message }],
        }
        set({
          open: true,
          hasOpened: true,
          pinned: false,
          initialQuery: '',
          entrySource: options.entrySource,
          chatId: generateChatId(),
          savedMessages: [localMessage],
          pendingLocalMessage: localMessage,
          conversationIdentity: options.conversationIdentity,
        })
      },
      closeSidebar: () => set({ open: false, pinned: false }),
      togglePin: () => set((state) => ({ pinned: !state.pinned })),
      setPinned: (pinned: boolean) => set({ pinned }),
      setActiveChatStop: (activeChatStop) => set({ activeChatStop }),
      saveMessages: (chatId: string, messages: UIMessage[]) => {
        if (get().chatId === chatId) set({ savedMessages: messages })
      },
      clearMessages: () =>
        set({
          savedMessages: [],
          chatId: generateChatId(),
          initialQuery: '',
          entrySource: 'header',
          pendingLocalMessage: null,
        }),
      consumePendingLocalMessage: (chatId: string) => {
        if (get().chatId === chatId) set({ pendingLocalMessage: null })
      },
      consumeInitialQuery: (chatId: string) => {
        if (get().chatId === chatId) set({ initialQuery: '' })
      },
      syncConversationIdentity: (identity: string) => {
        const previous = get().conversationIdentity
        if (previous === identity) return false
        if (previous === null) {
          set({ conversationIdentity: identity })
          return false
        }
        set({
          conversationIdentity: identity,
          savedMessages: [],
          pendingLocalMessage: null,
          chatId: generateChatId(),
        })
        return true
      },
    }),
    {
      name: 'bell-chat',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        pinned: state.pinned,
        savedMessages: state.savedMessages,
        chatId: state.chatId,
        conversationIdentity: state.conversationIdentity,
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          typeof persistedState === 'object' && persistedState !== null
            ? (persistedState as Partial<ChatSidebarState>)
            : {}
        if (
          isChatId(persisted.chatId) &&
          (persisted.conversationIdentity === null ||
            typeof persisted.conversationIdentity === 'string')
        ) {
          return { ...currentState, ...persisted }
        }
        // Before Bell conversations were server-addressable, browser IDs were
        // eight random characters. Start a clean UUID-backed conversation so
        // a long-lived tab does not replay incompatible history into a 400.
        return {
          ...currentState,
          ...persisted,
          chatId: generateChatId(),
          savedMessages: [],
          pendingLocalMessage: null,
          conversationIdentity: null,
        }
      },
    }
  )
)
