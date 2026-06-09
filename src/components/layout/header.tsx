'use client'

import { Search } from 'lucide-react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { MemberMenu } from '@/components/auth/member-menu'
import { Logo } from '@/components/layout/logo'
import { useNewsletter } from '@/components/layout/newsletter-context'
import { BellIcon } from '@/components/ui/bell-icon'
import { useChatSidebar } from '@/stores/chat-store'

// dynamic() splits chat (ai SDK + react-markdown) and search out of the
// first-load bundle — a conditional render of a static import would not.
const ChatSidebar = dynamic(
  () => import('@/components/chat/chat-sidebar').then((m) => m.ChatSidebar),
  { ssr: false }
)
const SearchDialog = dynamic(
  () => import('@/components/search/search-dialog').then((m) => m.SearchDialog),
  { ssr: false }
)

const prefetchChat = () => void import('@/components/chat/chat-sidebar')
const prefetchSearch = () => void import('@/components/search/search-dialog')

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
  // Stays true after first open so the dialog keeps its mounted state
  const [searchHasOpened, setSearchHasOpened] = useState(false)
  const { newsletter } = useNewsletter()
  const { openSidebar, hasOpened } = useChatSidebar()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setSearchHasOpened(true)
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
        <nav className="flex items-center gap-3 md:gap-5">
          <button
            type="button"
            onClick={() => {
              setSearchHasOpened(true)
              setSearchOpen(true)
            }}
            onMouseEnter={prefetchSearch}
            onFocus={prefetchSearch}
            aria-label="Search"
            className="p-2 -m-2"
          >
            <Search
              className="h-[18px] w-[18px] text-gray-400 transition-colors hover:text-gray-600"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={() => openSidebar()}
            onMouseEnter={prefetchChat}
            onFocus={prefetchChat}
            aria-label="Ask Bell"
            className="p-2 -m-2"
          >
            <BellIcon
              className="h-[18px] w-[18px] text-gray-400 transition-colors hover:text-gray-600"
              aria-hidden="true"
            />
          </button>
          <MemberMenu />
        </nav>
      </div>
      {searchHasOpened && (
        <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      )}
      {hasOpened && <ChatSidebar />}
    </header>
  )
}
