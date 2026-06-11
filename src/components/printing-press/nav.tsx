'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const items = [
  {
    href: '/printing-press',
    label: 'Overview',
    match: (p: string) => p === '/printing-press',
  },
  {
    href: '/printing-press/posts',
    label: 'Posts',
    // The send flow lives under /printing-press/send but belongs to Posts.
    match: (p: string) =>
      p.startsWith('/printing-press/posts') ||
      p.startsWith('/printing-press/send'),
  },
  {
    href: '/printing-press/subscribers',
    label: 'Subscribers',
    match: (p: string) => p.startsWith('/printing-press/subscribers'),
  },
  {
    href: '/printing-press/phone',
    label: 'Phone',
    match: (p: string) => p.startsWith('/printing-press/phone'),
  },
]

export function PrintingPressNav() {
  const pathname = usePathname()

  return (
    <nav className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {items.map((item) => {
        const active = item.match(pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'transition-colors',
              active
                ? 'text-gray-950 underline decoration-gray-300 underline-offset-4'
                : 'text-gray-500 hover:text-gray-900'
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
