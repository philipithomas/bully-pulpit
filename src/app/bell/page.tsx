import type { Metadata } from 'next'
import Image from 'next/image'
import { BellPageClient } from '@/app/bell/bell-page-client'
import { siteConfig } from '@/lib/config'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { publicAppPage } from '@/lib/public-pages'

const bellPage = publicAppPage('/bell')
const socialTitle = `${bellPage.title} | ${siteConfig.title}`

export const metadata: Metadata = {
  title: bellPage.title,
  description: bellPage.description,
  alternates: { canonical: '/bell', types: feedDiscovery() },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/bell',
    siteName: siteConfig.title,
    title: socialTitle,
    description: bellPage.description,
    images: [{ url: siteConfig.image, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: socialTitle,
    description: bellPage.description,
    images: [{ url: siteConfig.image, width: 1200, height: 630 }],
  },
}

export default function BellPage() {
  return (
    <div className="bell-page-shell container flex min-h-[calc(100svh-5rem)] flex-col pt-6 pb-10 sm:pt-8 md:pt-10 md:pb-14">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        <header className="bell-page-heading flex items-center gap-4 px-3 pb-6 sm:px-4">
          <Image src="/images/bell.svg" alt="" width={48} height={48} />
          <div>
            <h1 className="font-semibold text-2xl tracking-tight text-gray-950 sm:text-3xl">
              Search with Bell
            </h1>
            <p className="mt-1 font-serif text-gray-600">
              Ask across Philip&apos;s writing, photographs, and projects.
            </p>
          </div>
        </header>

        <BellPageClient />

        <p className="bell-page-disclaimer px-3 pt-4 font-sans text-xs leading-relaxed text-gray-500 sm:px-4">
          Bell is an AI research assistant. It can make mistakes, so follow its
          source links when details matter.
        </p>
      </div>
    </div>
  )
}
