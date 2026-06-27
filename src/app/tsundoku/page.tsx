import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { SubscribeCta } from '@/components/posts/subscribe-cta'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import type { Post } from '@/lib/content/types'
import { feedDiscovery } from '@/lib/feeds/discovery'

export const metadata: Metadata = {
  title: 'Tsundoku',
  description: siteConfig.newsletters.tsundoku.tagline,
  alternates: {
    canonical: '/tsundoku',
    types: feedDiscovery('tsundoku'),
  },
  icons: {
    icon: [
      { url: siteConfig.newsletters.tsundoku.icon, type: 'image/svg+xml' },
    ],
    apple: siteConfig.newsletters.tsundoku.icon,
  },
}

const ROW_HEIGHT = 260
const MAX_ROW_WIDTH = 1216
const STRETCH = 1.25
const INTRO =
  'Starting 2026-06-26, I got a new camera and embarked on a two-week solo trip around Japan. I decided to make it photography-focused, and this pop-up newsletter documents my photography during these two weeks.'

function tileSizes(ratio: number): string {
  const tabletVw = Math.min(
    100,
    Math.round(((ratio * ROW_HEIGHT * STRETCH) / 720) * 100)
  )
  const desktopPx = Math.min(
    MAX_ROW_WIDTH,
    Math.round(ratio * ROW_HEIGHT * STRETCH)
  )
  return `(max-width: 640px) 100vw, (max-width: 1024px) ${tabletVw}vw, ${desktopPx}px`
}

function PhotoTile({ post, index }: { post: Post; index: number }) {
  const { coverImage, coverImageAlt, title, location } = post.frontmatter
  if (!coverImage || !post.coverDimensions) return null

  const ratio = post.coverDimensions.width / post.coverDimensions.height

  return (
    <figure
      className="group relative"
      style={{
        flexGrow: ratio * 100,
        flexBasis: `calc(var(--row-h) * ${ratio.toFixed(4)})`,
      }}
    >
      <button
        type="button"
        aria-label={coverImageAlt ?? title}
        data-zoomable=""
        data-zoom-group="tsundoku"
        data-zoom-caption-href={`/${post.slug}`}
        data-zoom-caption-title={title}
        data-zoom-caption-description={
          post.frontmatter.description ?? post.excerpt
        }
        data-full-src={coverImage}
        className="relative block w-full cursor-zoom-in overflow-hidden bg-gray-100"
        style={{
          aspectRatio: `${post.coverDimensions.width} / ${post.coverDimensions.height}`,
        }}
      >
        <Image
          src={coverImage}
          alt={coverImageAlt ?? title}
          fill
          sizes={tileSizes(ratio)}
          className="object-cover transition-transform duration-700 group-hover:scale-[1.01]"
          priority={index < 3}
        />
      </button>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-gray-500">
        <time>{post.frontmatter.publishedAt}</time>
        {location ? (
          <>
            <span aria-hidden="true">/</span>
            <a
              href={location.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-gray-300 underline-offset-2 transition-colors hover:text-rising-sun"
            >
              {location.name}
            </a>
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <Link
          href={`/${post.slug}`}
          className="underline decoration-gray-300 underline-offset-2 transition-colors hover:text-rising-sun"
        >
          {title}
        </Link>
      </figcaption>
    </figure>
  )
}

export default function TsundokuPage() {
  const posts = getPostsByNewsletter('tsundoku')

  return (
    <div className="bg-[#f4f4f2]" data-bg="tsundoku">
      <div className="container py-12 md:py-16">
        <div className="mb-10 md:mb-12 flex flex-col items-center text-center">
          <Image
            src="/images/tsundoku.svg"
            alt="Tsundoku"
            width={280}
            height={40}
            className="h-9 w-auto md:h-11"
            priority
          />
          <h1 className="sr-only">Tsundoku</h1>
          <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-gray-600">
            {INTRO}
          </p>
          <SubscribeCta newsletter="tsundoku" className="mt-8" />
        </div>

        <div className="flex flex-wrap gap-x-2 gap-y-6 [--row-h:180px] sm:[--row-h:260px]">
          {posts.map((post, index) => (
            <PhotoTile key={post.slug} post={post} index={index} />
          ))}
          <div aria-hidden className="grow-[9999] basis-0" />
        </div>
      </div>
    </div>
  )
}
