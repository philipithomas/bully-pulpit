'use client'

import type { MouseEvent, ReactNode } from 'react'
import { useChatSidebar } from '@/stores/chat-store'

function handleBellClick(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault()
  useChatSidebar.getState().openSidebar(undefined, { entrySource: 'explore' })
}

export function ExploreBellLink({
  children,
  className,
  describedBy,
}: {
  children: ReactNode
  className: string
  describedBy: string
}) {
  return (
    <a
      href="#bell"
      className={className}
      aria-describedby={describedBy}
      onClick={handleBellClick}
    >
      {children}
    </a>
  )
}
