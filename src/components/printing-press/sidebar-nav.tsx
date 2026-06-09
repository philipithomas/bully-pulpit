'use client'

import { LayoutDashboard, Send, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const items = [
  {
    href: '/printing-press',
    label: 'Overview',
    icon: LayoutDashboard,
    match: (p: string) => p === '/printing-press',
  },
  {
    href: '/printing-press/posts',
    label: 'Posts',
    icon: Send,
    match: (p: string) =>
      p.startsWith('/printing-press/posts') ||
      p.startsWith('/printing-press/send'),
  },
  {
    href: '/printing-press/subscribers',
    label: 'Subscribers',
    icon: Users,
    match: (p: string) => p.startsWith('/printing-press/subscribers'),
  },
]

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.match(pathname)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-gray-075 text-gray-950'
                : 'text-gray-600 hover:bg-gray-050 hover:text-gray-900'
            )}
          >
            <Icon
              className={cn(
                'h-[18px] w-[18px]',
                active
                  ? 'text-gray-700'
                  : 'text-gray-400 group-hover:text-gray-600'
              )}
            />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
