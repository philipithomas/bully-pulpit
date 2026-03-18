'use client'

import { Search } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { MemberMenu } from '@/components/auth/member-menu'
import { ChatSidebar } from '@/components/chat/chat-sidebar'
import { Logo } from '@/components/layout/logo'
import { useNewsletter } from '@/components/layout/newsletter-context'
import { SearchDialog } from '@/components/search/search-dialog'

const newsletterLogos: Record<string, { src: string; className: string }> = {
  contraption: {
    src: '/images/contraption.svg',
    className: 'h-[17px] w-auto',
  },
  workshop: {
    src: '/images/workshop-brand.svg',
    className: 'h-[24px] w-auto',
  },
  postcard: {
    src: '/images/postcard.svg',
    className: 'h-[18px] w-auto',
  },
}

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false)
  const { newsletter } = useNewsletter()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setSearchOpen((prev) => !prev)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <header className="py-4 md:py-6">
      <div className="container flex items-center justify-between">
        <div className="relative h-6 flex items-center">
          <div
            className={`transition-opacity duration-200 ${newsletter && newsletterLogos[newsletter] ? 'opacity-0' : 'opacity-100'}`}
          >
            <Logo />
          </div>
          {Object.entries(newsletterLogos).map(([slug, logo]) => (
            <Link
              key={slug}
              href={`/${slug}`}
              className={`absolute left-0 top-1/2 -translate-y-1/2 flex items-center transition-opacity duration-200 ${newsletter === slug ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              <Image
                src={logo.src}
                alt={slug.charAt(0).toUpperCase() + slug.slice(1)}
                width={160}
                height={20}
                className={logo.className}
              />
            </Link>
          ))}
        </div>
        <nav className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="p-2 -m-2"
          >
            <Search
              className="h-[18px] w-[18px] text-gray-400 transition-colors hover:text-gray-600"
              aria-hidden="true"
            />
          </button>
          <MemberMenu />
        </nav>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <ChatSidebar />
    </header>
  )
}
