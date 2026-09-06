'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/** The homepage owns a compact colophon. Omit the full footer there so its
 * weather widget does not mount or start background requests while hidden. */
export function FooterPlacement({ children }: { children: ReactNode }) {
  return usePathname() === '/' ? null : children
}
