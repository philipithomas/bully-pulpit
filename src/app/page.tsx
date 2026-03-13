import Image from 'next/image'
import Link from 'next/link'
import { InlineSignupForm } from '@/components/auth/inline-signup-form'
import { LatestPostPill } from '@/components/posts/latest-post-pill'
import { JsonLd } from '@/components/seo/json-ld'
import { siteConfig } from '@/lib/config'

const newsletterLogos: Record<string, { src: string; className: string }> = {
  contraption: {
    src: '/images/contraption.svg',
    className: 'h-[13px] w-auto shrink-0',
  },
  workshop: {
    src: '/images/workshop-brand.svg',
    className: 'h-4 w-auto shrink-0',
  },
  postcard: {
    src: '/images/postcard.svg',
    className: 'h-[14px] w-auto shrink-0',
  },
}

export default function HomePage() {
  const newsletters = Object.values(siteConfig.newsletters)

  return (
    <div className="container py-16 md:py-24 lg:py-36">
      <JsonLd type="website" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
        {/* Left: Portrait (desktop only) */}
        <div className="hidden lg:block">
          <Image
            src="/images/portrait.jpg"
            alt="Philip I. Thomas"
            width={600}
            height={750}
            className="w-full max-w-md cursor-zoom-in"
            data-zoomable=""
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
          <div className="font-serif text-lg text-gray-600 leading-relaxed mb-8 lg:mb-12 max-w-prose">
            <p className="mb-4">
              I build at the intersection of math, business, and software. I
              work on the engineering team at{' '}
              <a
                href="https://www.trychroma.com"
                className="text-gray-800 underline decoration-gray-300 underline-offset-2 hover:text-forest transition-colors duration-300"
              >
                Chroma
              </a>
              .
            </p>
            <p className="mb-4">
              I live in San Francisco. I&apos;m interested in coffee,
              fermentation, and urbanism.
            </p>
            <p>
              In the past, I made{' '}
              <a
                href="/internal-tools-of-find-ai"
                className="text-gray-800 underline decoration-gray-300 underline-offset-2 hover:text-forest transition-colors duration-300"
              >
                Find AI
              </a>
              ,{' '}
              <a
                href="https://techcrunch.com/2020/02/17/pullrequest-snags-remote-developer-hiring-platform-moonlight-in-case-of-startup-buying-startup/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-800 underline decoration-gray-300 underline-offset-2 hover:text-forest transition-colors duration-300"
              >
                Moonlight
              </a>
              , and{' '}
              <a
                href="https://techcrunch.com/2015/10/22/staffjoy-launches-from-yc-fellowship-helping-businesses-automate-their-workforce-scheduling/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-800 underline decoration-gray-300 underline-offset-2 hover:text-forest transition-colors duration-300"
              >
                Staffjoy
              </a>
              .
            </p>
          </div>

          {/* Horizontal portrait (mobile only) */}
          <div className="lg:hidden mb-8">
            <Image
              src="/images/philip-horizontal.jpg"
              alt="Philip I. Thomas"
              width={4000}
              height={2563}
              className="w-full cursor-zoom-in"
              data-zoomable=""
              data-zoom-src="/images/portrait.jpg"
              priority
            />
          </div>

          {/* Social links */}
          <p className="mb-8 font-serif text-sm text-gray-500">
            Connect with me on{' '}
            <a
              href="https://github.com/philipithomas"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-forest transition-colors duration-300"
            >
              GitHub
            </a>{' '}
            and{' '}
            <a
              href="https://linkedin.com/in/philipithomas"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-forest transition-colors duration-300"
            >
              LinkedIn
            </a>
            .
          </p>

          {/* Subscribe (hidden when logged in) */}
          <InlineSignupForm hideWhenLoggedIn autoFocus />

          {/* Newsletter directory */}
          <div className="mt-8">
            <p className="font-serif text-sm text-gray-500 mb-6">
              I publish three newsletters:
            </p>
            <div className="space-y-4">
              {newsletters.map((nl) => (
                <Link
                  key={nl.slug}
                  href={`/${nl.slug}`}
                  className="flex items-center gap-3 group"
                >
                  <Image
                    src={newsletterLogos[nl.slug].src}
                    alt={nl.name}
                    width={100}
                    height={20}
                    className={newsletterLogos[nl.slug].className}
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
    </div>
  )
}
