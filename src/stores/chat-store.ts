import type { UIMessage } from 'ai'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface ChatSidebarState {
  open: boolean
  // True once the sidebar has ever been opened — gates the lazy chat bundle
  // in the Header. Never reset so the mounted sidebar survives close.
  hasOpened: boolean
  pinned: boolean
  initialQuery: string
  savedMessages: UIMessage[]
  chatId: string
  openSidebar: (query?: string) => void
  closeSidebar: () => void
  togglePin: () => void
  setPinned: (pinned: boolean) => void
  saveMessages: (messages: UIMessage[]) => void
  clearMessages: () => void
}

function generateChatId() {
  return Math.random().toString(36).slice(2, 10)
}

export const useChatSidebar = create<ChatSidebarState>()(
  persist(
    (set) => ({
      open: false,
      hasOpened: false,
      pinned: false,
      initialQuery: '',
      savedMessages: [],
      chatId: generateChatId(),
      openSidebar: (query?: string) =>
        set({ open: true, hasOpened: true, initialQuery: query ?? '' }),
      closeSidebar: () => set({ open: false, pinned: false }),
      togglePin: () => set((state) => ({ pinned: !state.pinned })),
      setPinned: (pinned: boolean) => set({ pinned }),
      saveMessages: (messages: UIMessage[]) => set({ savedMessages: messages }),
      clearMessages: () => set({ savedMessages: [], chatId: generateChatId() }),
    }),
    {
      name: 'bell-chat',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        pinned: state.pinned,
        savedMessages: state.savedMessages,
        chatId: state.chatId,
      }),
    }
  )
)
