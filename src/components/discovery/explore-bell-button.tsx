'use client'

import type { ReactNode } from 'react'
import { useChatSidebar } from '@/stores/chat-store'

function handleBellClick() {
  useChatSidebar.getState().openSidebar(undefined, { entrySource: 'explore' })
}

export function ExploreBellButton({
  children,
  className,
}: {
  children: ReactNode
  className: string
}) {
  return (
    <button type="button" className={className} onClick={handleBellClick}>
      {children}
    </button>
  )
}
