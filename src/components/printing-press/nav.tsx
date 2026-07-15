'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  {
    href: '/printing-press/bell',
    label: 'Bell',
    match: (p: string) => p.startsWith('/printing-press/bell'),
  },
]

export function PrintingPressNav() {
  const pathname = usePathname()
  const current = items.find((item) => item.match(pathname)) ?? items[0]

  return (
    <>
      <nav
        aria-label="Printing press sections"
        className="hidden items-center gap-1 font-sans text-sm sm:flex"
      >
        {items.map((item) => {
          const active = item.match(pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 items-center px-3 transition-colors',
                active
                  ? 'bg-gray-950 font-semibold text-white'
                  : 'text-gray-600 hover:bg-gray-075 hover:text-gray-950'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <nav aria-label="Printing press sections" className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Current section: ${current.label}. Choose a section`}
              className="inline-flex h-11 min-w-32 items-center justify-between gap-2 border border-gray-300 bg-background px-3 font-sans text-gray-950 text-sm transition-colors hover:border-gray-950"
            >
              <span>{current.label}</span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 text-gray-500"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {items.map((item) => {
              const active = item.match(pathname)
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center justify-between',
                      active && 'font-semibold text-gray-950'
                    )}
                  >
                    <span>{item.label}</span>
                    {active ? (
                      <span aria-hidden="true" className="size-1.5 bg-brass" />
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </>
  )
}
