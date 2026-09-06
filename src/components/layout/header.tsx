'use client'

import { Search } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MemberMenu } from '@/components/auth/member-menu'
import { ExploreNavigationLink } from '@/components/layout/explore-navigation-link'
import { Logo } from '@/components/layout/logo'
import { useNewsletter } from '@/components/layout/newsletter-context'
import { NewsletterWordmark } from '@/components/tidbits/newsletter-wordmark'
import { BellIcon } from '@/components/ui/bell-icon'
import { Spinner } from '@/components/ui/spinner'
import {
  BELL_DISCOVERY_OPENED_KEY,
  BELL_DISCOVERY_VIEWS_KEY,
  nextBellDiscoveryPageView,
  shouldNudgeBellDiscovery,
} from '@/lib/chat/discovery'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'
import { useChatSidebar } from '@/stores/chat-store'

// The deferred components own focus and modal behavior once loaded. Until
// then, keep these fallbacks non-interactive and non-modal so the activating
// control retains focus and the page remains truthfully available.
export function ChatSidebarLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-4 top-4 z-50 flex items-center gap-2 bg-offwhite-light px-4 py-3 font-sans text-sm text-gray-600 shadow-xl"
    >
      <BellIcon className="h-5 w-5 text-gray-950" aria-hidden="true" />
      <span>Opening Bell…</span>
      <Spinner className="h-4 w-4" />
    </div>
  )
}

export function SearchDialogLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed top-[15vh] left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 bg-card px-4 py-3 font-sans text-sm text-gray-600 shadow-xl"
    >
      <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      <span className="flex-1">Loading search…</span>
      <Spinner className="h-4 w-4 text-gray-400" />
    </div>
  )
}

// dynamic() splits chat (ai SDK + react-markdown) and search out of the
// first-load bundle — a conditional render of a static import would not.
const ChatSidebar = dynamic(
  () => import('@/components/chat/chat-sidebar').then((m) => m.ChatSidebar),
  { loading: ChatSidebarLoading, ssr: false }
)
const SearchDialog = dynamic(
  () => import('@/components/search/search-dialog').then((m) => m.SearchDialog),
  { loading: SearchDialogLoading, ssr: false }
)

const prefetchChat = () => void import('@/components/chat/chat-sidebar')
const prefetchSearch = () => void import('@/components/search/search-dialog')

const newsletterLogos: Record<
  Newsletter,
  { src: string; width: number; height: number; className: string }
> = {
  contraption: {
    src: '/images/contraption.svg',
    width: 1948,
    height: 350,
    className: 'h-[17px] w-auto',
  },
  workshop: {
    src: '/images/workshop-brand.svg',
    width: 494,
    height: 137,
    className: 'h-[24px] w-auto',
  },
  postcard: {
    src: '/images/postcard.svg',
    width: 2794,
    height: 636.8,
    className: 'h-[18px] w-auto',
  },
  tidbits: {
    src: '/images/tidbits.svg',
    width: 1688,
    height: 369,
    className: 'h-[19px] w-auto',
  },
  tsundoku: {
    src: '/images/tsundoku.svg',
    width: 884,
    height: 135,
    className: 'h-[18px] w-auto',
  },
}

export function Header() {
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)
  // Stays true after first open so the dialog keeps its mounted state
  const [searchHasOpened, setSearchHasOpened] = useState(false)
  const [nudgeBell, setNudgeBell] = useState(false)
  const countedBellPathRef = useRef<string | null>(null)
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

  // Give the expressive bell one restrained ring on the second page view.
  // Reduced-motion visitors receive no animation through the global CSS guard.
  useEffect(() => {
    if (!pathname) return
    if (countedBellPathRef.current === pathname) return
    countedBellPathRef.current = pathname
    setNudgeBell(false)
    try {
      const pageView = nextBellDiscoveryPageView(
        sessionStorage.getItem(BELL_DISCOVERY_VIEWS_KEY)
      )
      sessionStorage.setItem(BELL_DISCOVERY_VIEWS_KEY, String(pageView))
      const bellWasOpened =
        sessionStorage.getItem(BELL_DISCOVERY_OPENED_KEY) === 'true' ||
        useChatSidebar.getState().hasOpened
      if (!shouldNudgeBellDiscovery(pageView, bellWasOpened)) return

      setNudgeBell(true)
      const timeout = window.setTimeout(() => setNudgeBell(false), 1400)
      return () => window.clearTimeout(timeout)
    } catch {
      // Storage can be unavailable in strict privacy modes. Discovery still
      // works through the visible label.
    }
  }, [pathname])

  const handleOpenBell = useCallback(() => {
    try {
      sessionStorage.setItem(BELL_DISCOVERY_OPENED_KEY, 'true')
    } catch {
      // Opening Bell never depends on browser storage.
    }
    setNudgeBell(false)
    openSidebar()
  }, [openSidebar])

  const handleOpenSearch = useCallback(() => {
    setSearchHasOpened(true)
    setSearchOpen(true)
  }, [])
  const newsletterLogo = newsletter ? newsletterLogos[newsletter] : null

  return (
    <header className="py-3 sm:py-4 md:py-6">
      <div className="container flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="relative h-6 flex items-center">
          <div
            className={`transition-opacity duration-200 ${newsletterLogo ? 'opacity-0' : 'opacity-100'}`}
          >
            <Logo />
          </div>
          {newsletter && newsletterLogo ? (
            <Link
              href={`/${newsletter}`}
              className="-translate-y-1/2 absolute top-1/2 left-0 flex items-center"
            >
              <NewsletterWordmark
                src={newsletterLogo.src}
                alt={siteConfig.newsletters[newsletter].name}
                width={newsletterLogo.width}
                height={newsletterLogo.height}
                className={`dark-viewport-invert ${newsletterLogo.className}`}
                style={{ width: 'auto' }}
              />
            </Link>
          ) : null}
        </div>
        <nav
          aria-label="Primary"
          className="flex w-full items-center justify-between sm:w-auto sm:justify-start sm:gap-3 md:gap-5"
        >
          <ExploreNavigationLink active={pathname === '/explore'} />
          <button
            type="button"
            onClick={handleOpenSearch}
            onMouseEnter={prefetchSearch}
            onFocus={prefetchSearch}
            aria-label="Search"
            className="group p-3 -m-3 cursor-pointer"
          >
            <Search
              className="h-[18px] w-[18px] text-gray-400 transition-colors group-hover:text-gray-600"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={handleOpenBell}
            onMouseEnter={prefetchChat}
            onFocus={prefetchChat}
            aria-label="Open Bell"
            className="group p-3 -m-3 cursor-pointer"
          >
            <BellIcon
              className={`h-[18px] w-[18px] text-gray-400 transition-colors group-hover:text-gray-600 ${nudgeBell ? 'bell-discovery-nudge' : ''}`}
              aria-hidden="true"
            />
          </button>
          <MemberMenu />
        </nav>
      </div>
      {searchHasOpened ? (
        <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      ) : null}
      {hasOpened ? <ChatSidebar /> : null}
    </header>
  )
}
