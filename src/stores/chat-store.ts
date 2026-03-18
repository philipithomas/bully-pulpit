import { create } from 'zustand'

interface ChatSidebarState {
  open: boolean
  initialQuery: string
  openSidebar: (query?: string) => void
  closeSidebar: () => void
}

export const useChatSidebar = create<ChatSidebarState>((set) => ({
  open: false,
  initialQuery: '',
  openSidebar: (query?: string) =>
    set({ open: true, initialQuery: query ?? '' }),
  closeSidebar: () => set({ open: false }),
}))
