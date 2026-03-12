'use client'

import { Search } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { MemberMenu } from '@/components/auth/member-menu'
import { Logo } from '@/components/layout/logo'
import { useNewsletter } from '@/components/layout/newsletter-context'
import { SearchDialog } from '@/components/search/search-dialog'

const newsletterLogos: Record<string, { src: string; className: string }> = {
  contraption: {
    src: '/images/contraption-brand.svg',
    className: 'h-[14px] w-auto',
  },
  workshop: {
    src: '/images/workshop-brand.svg',
    className: 'h-4 w-auto',
  },
  postcard: {
    src: '/images/postcard.svg',
    className: 'h-3 w-auto',
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
        {newsletter && newsletterLogos[newsletter] ? (
          <Link href={`/${newsletter}`} className="flex items-center">
            <Image
              src={newsletterLogos[newsletter].src}
              alt={newsletter.charAt(0).toUpperCase() + newsletter.slice(1)}
              width={160}
              height={20}
              className={newsletterLogos[newsletter].className}
            />
          </Link>
        ) : (
          <Logo />
        )}
        <nav className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
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
    </header>
  )
}
