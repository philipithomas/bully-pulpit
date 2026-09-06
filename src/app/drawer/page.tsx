import { Suspense } from 'react'
import { DrawerClient } from '@/app/drawer/drawer-client'
import { SetNewsletter } from '@/components/layout/newsletter-context'
import { getDrawerCatalog } from '@/lib/drawer/catalog'
import { publicAppPage } from '@/lib/public-pages'
import { createPublicPageMetadata } from '@/lib/seo/metadata'

const drawerPage = publicAppPage('/drawer')

export const metadata = createPublicPageMetadata({
  path: drawerPage.path,
  title: drawerPage.title,
  description: drawerPage.description,
})

export const dynamic = 'force-static'

function DrawerFallback() {
  return (
    <div
      role="status"
      className="border-gray-300 border-y py-16 text-center font-serif text-lg text-gray-600"
    >
      Opening today&rsquo;s drawer…
    </div>
  )
}

export default function DrawerPage() {
  const catalog = getDrawerCatalog()

  return (
    <div className="bg-offwhite-warm" data-bg="offwhite-warm">
      <SetNewsletter newsletter={null} />
      <div className="container py-12 md:py-16 lg:py-20">
        <header className="mb-10 max-w-3xl">
          <p className="mb-4 font-mono text-xs text-gray-500 tracked-caps">
            A daily cabinet of curiosities
          </p>
          <h1 className="font-serif text-5xl tracking-tight text-gray-950 sm:text-6xl lg:text-7xl">
            The Drawer
          </h1>
          <p className="mt-5 max-w-2xl font-serif text-lg leading-relaxed text-gray-600 sm:text-xl">
            Five things pulled from the corners of this site: something to read,
            a photograph, two curious terms, and somewhere else worth visiting.
            Everyone opens the same drawer each day.
          </p>
        </header>

        <Suspense fallback={<DrawerFallback />}>
          <DrawerClient catalog={catalog} />
        </Suspense>
      </div>
    </div>
  )
}
