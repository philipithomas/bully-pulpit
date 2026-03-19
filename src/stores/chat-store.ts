import type { UIMessage } from 'ai'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface ChatSidebarState {
  open: boolean
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
      pinned: false,
      initialQuery: '',
      savedMessages: [],
      chatId: generateChatId(),
      openSidebar: (query?: string) =>
        set({ open: true, initialQuery: query ?? '' }),
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
