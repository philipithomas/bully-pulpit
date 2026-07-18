'use client'

import dynamic from 'next/dynamic'

const BellPageChat = dynamic(
  () =>
    import('@/components/chat/chat-sidebar').then(
      (module) => module.BellPageChat
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="bell-page-chat flex-none bg-offwhite-light"
        aria-hidden="true"
      />
    ),
  }
)

export function BellPageClient() {
  return <BellPageChat />
}
