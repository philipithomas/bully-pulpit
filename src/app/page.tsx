import Image from 'next/image'
import Link from 'next/link'
import { InlineSignupForm } from '@/components/auth/inline-signup-form'
import { LatestPostPill } from '@/components/posts/latest-post-pill'
import { JsonLd } from '@/components/seo/json-ld'
import { siteConfig } from '@/lib/config'

const newsletterLogos: Record<string, string> = {
  contraption: '/images/contraption-brand.svg',
  workshop: '/images/workshop-brand.svg',
  postcard: '/images/postcard.svg',
}

export default function HomePage() {
  const newsletters = Object.values(siteConfig.newsletters)

  return (
    <div className="container py-16 md:py-24 lg:py-36">
      <JsonLd type="website" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
        {/* Left: Portrait */}
        <div>
          <Image
            src="/images/portrait.jpg"
            alt="Philip I. Thomas"
            width={600}
            height={750}
            className="w-full max-w-md rounded-sm"
            priority
          />
        </div>

        {/* Right: Bio + Newsletter signup */}
        <div>
          <div className="mb-6">
            <LatestPostPill />
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-gray-950 mb-6">
            Crafting digital tools
          </h1>
          <div className="font-serif text-lg text-gray-600 leading-relaxed mb-12 max-w-prose">
            <p className="mb-4">
              I build at the intersection of math, business, and software. I
              work on the engineering team at{' '}
              <a
                href="https://www.trychroma.com"
                className="text-gray-800 underline decoration-gray-300 underline-offset-2 hover:text-forest transition-colors duration-300"
              >
                Chroma
              </a>
              . I write about crafting digital tools at Contraption Company.
            </p>
            <p className="mb-4">
              I live in San Francisco. I&apos;m interested in coffee,
              fermentation, and urbanism.
            </p>
            <p>In the past, I made Find AI, Moonlight, and Staffjoy.</p>
          </div>

          {/* Newsletter subscribe section */}
          <div className="border-t border-gray-200 pt-8">
            <p className="font-sans text-sm font-semibold text-gray-950 mb-1">
              Subscribe to my updates
            </p>
            <p className="font-serif text-sm text-gray-500 mb-6">
              Three newsletters — pick your interests.
            </p>

            <InlineSignupForm showNewsletterPicker />

            <p className="font-sans text-xs text-gray-400 mt-4">
              You can unsubscribe at any time.
            </p>
          </div>

          {/* Newsletter directory */}
          <div className="border-t border-gray-200 mt-10 pt-8 space-y-4">
            {newsletters.map((nl) => (
              <Link
                key={nl.slug}
                href={`/${nl.slug}`}
                className="flex items-center gap-3 group"
              >
                <Image
                  src={newsletterLogos[nl.slug]}
                  alt={nl.name}
                  width={100}
                  height={20}
                  className="h-4 w-auto shrink-0"
                />
                <span className="font-serif text-sm text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                  {nl.tagline}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
