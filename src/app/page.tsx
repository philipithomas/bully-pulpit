import type { Metadata } from 'next'
import Image, { getImageProps } from 'next/image'
import Link from 'next/link'
import { InlineSignupForm } from '@/components/auth/inline-signup-form'
import { LatestPostPill } from '@/components/posts/latest-post-pill'
import { JsonLd } from '@/components/seo/json-ld'
import { siteConfig } from '@/lib/config'
import { zoomImageDataAttrs } from '@/lib/content/zoom-image'
import { countActive } from '@/lib/db/queries/subscribers'
import { feedDiscovery } from '@/lib/feeds/discovery'

// Auth redirects land on /?signed-in=1 and /?error=invalid-token; the
// canonical collapses those variants.
export const metadata: Metadata = {
  alternates: { canonical: '/', types: feedDiscovery() },
}

async function buildTimeSubscriberCount(): Promise<number | null> {
  try {
    return await countActive()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[home] build-time subscriber count unavailable: ${message}`)
    return null
  }
}

export default async function HomePage() {
  const newsletters = [
    siteConfig.newsletters.postcard,
    siteConfig.newsletters.contraption,
    siteConfig.newsletters.workshop,
    siteConfig.newsletters.tsundoku,
  ]

  // Art-directed portraits: each layout slot renders a <picture> carrying
  // both srcSets, so the hidden slot resolves to the same URL as the visible
  // one (a single fetch per device) instead of two priority preloads.
  const { props: desktopPortrait } = getImageProps({
    alt: 'Philip I. Thomas',
    src: '/images/portrait.jpg',
    width: 600,
    height: 750,
    sizes: '448px',
    priority: true,
    fetchPriority: 'high',
  })
  const subscriberCount = await buildTimeSubscriberCount()
  const { props: mobilePortrait } = getImageProps({
    alt: 'Philip I. Thomas',
    src: '/images/philip-horizontal.jpg',
    width: 1024,
    height: 656,
    sizes: '100vw',
    priority: true,
    fetchPriority: 'high',
  })

  return (
    <div className="container pt-6 pb-12 sm:pt-8 sm:pb-14 md:pt-10 md:pb-16 lg:pt-12 lg:pb-20">
      <JsonLd type="website" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
        {/* Left: Portrait (desktop only) */}
        <div className="hidden lg:block">
          <picture>
            {/* 1023.98px closes the fractional-zoom gap below the 1024px lg
                breakpoint — if neither source matched, both portraits load. */}
            <source
              media="(max-width: 1023.98px)"
              srcSet={mobilePortrait.srcSet}
              sizes={mobilePortrait.sizes}
            />
            <img
              {...desktopPortrait}
              className="w-full max-w-md h-auto cursor-zoom-in"
              data-zoomable=""
              {...zoomImageDataAttrs({
                src: '/images/portrait.jpg',
                dimensions: { width: 4000, height: 5000 },
              })}
            />
          </picture>
        </div>

        {/* Right: Bio + Newsletter signup */}
        <div>
          <div className="mb-6">
            <LatestPostPill />
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-gray-950 mb-6">
            Crafting digital tools
          </h1>
          <div className="font-serif text-lg text-gray-900 leading-relaxed mb-8 lg:mb-12 max-w-prose">
            <p className="mb-4">
              I&apos;m an engineer based in New York City, working at the
              intersection of math, software, and business. I am interested in
              urbanism, coffee, and photography.
            </p>
            <p className="mb-4">
              I don&apos;t use social media, so this website contains my writing
              and media.
            </p>
            <p>
              Connect with me on{' '}
              <a
                href="https://github.com/philipithomas"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-800 underline decoration-forest underline-offset-2 hover:text-forest transition-colors duration-300"
              >
                GitHub
              </a>{' '}
              and{' '}
              <a
                href="https://linkedin.com/in/philipithomas"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-800 underline decoration-forest underline-offset-2 hover:text-forest transition-colors duration-300"
              >
                LinkedIn
              </a>
              .
            </p>
          </div>

          {/* Horizontal portrait (mobile only) */}
          <div className="lg:hidden mb-8">
            <picture>
              <source
                media="(min-width: 1024px)"
                srcSet={desktopPortrait.srcSet}
                sizes={desktopPortrait.sizes}
              />
              <img
                {...mobilePortrait}
                className="w-full h-auto cursor-zoom-in"
                data-zoomable=""
                {...zoomImageDataAttrs({
                  src: '/images/portrait.jpg',
                  dimensions: { width: 4000, height: 5000 },
                })}
              />
            </picture>
          </div>

          {/* Subscribe (hidden when logged in) */}
          <InlineSignupForm
            hideWhenLoggedIn
            initialSubscriberCount={subscriberCount}
          />

          {/* Newsletter directory */}
          <div className="mt-8">
            <p className="font-serif text-sm text-gray-600 mb-6">
              I publish these newsletters:
            </p>
            <div className="space-y-4">
              {newsletters.map((nl) => (
                <Link
                  key={nl.slug}
                  href={`/${nl.slug}`}
                  className="flex items-center gap-3 group"
                >
                  <span className="w-[100px] shrink-0 flex items-center">
                    <Image
                      src={nl.logo.src}
                      alt={nl.name}
                      width={100}
                      height={nl.logo.height}
                      style={{ height: nl.logo.height, width: 'auto' }}
                      className="w-auto shrink-0"
                    />
                  </span>
                  <span className="font-serif text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                    {nl.tagline}
                  </span>
                </Link>
              ))}
            </div>
            <p className="font-serif text-sm text-gray-500 mt-3">
              Available by email or{' '}
              <Link
                href="/feed/rss.xml"
                className="underline decoration-forest underline-offset-2 hover:text-forest transition-colors duration-300"
              >
                RSS
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
