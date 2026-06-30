import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { SubscribeCta } from '@/components/posts/subscribe-cta'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { markdownToPlaintext } from '@/lib/content/render-html'
import type { Post } from '@/lib/content/types'
import {
  CAPTIONED_ZOOM_IMAGE_SIZES,
  zoomImageDataAttrs,
} from '@/lib/content/zoom-image'
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
const PHOTO_VIEWER_DESCRIPTION_MAX = 900
const TRIP_START = '2026-06-24'
const TRIP_END = '2026-07-07'
const INTRO = [
  'In Summer 2026, I found myself with unexpected downtime between jobs. I flew to Japan, bought a camera, and practiced photography.',
  'My photos usually live inside essays, so I quickly built up a stack of unpublished images.',
]
const INTRO_FINAL =
  'This pop-up newsletter shares my favorite photos from the trip.'

function photoViewerDescription(post: Post): string {
  const text =
    post.frontmatter.description ??
    markdownToPlaintext(post.content, PHOTO_VIEWER_DESCRIPTION_MAX + 1)

  return text.length > PHOTO_VIEWER_DESCRIPTION_MAX
    ? `${text.slice(0, PHOTO_VIEWER_DESCRIPTION_MAX).trimEnd()}...`
    : text
}

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
        data-zoom-caption-description={photoViewerDescription(post)}
        data-zoom-caption-date={post.frontmatter.publishedAt}
        data-zoom-caption-location-name={location?.name}
        data-zoom-caption-location-url={location?.url}
        {...zoomImageDataAttrs({
          src: coverImage,
          dimensions: post.coverDimensions,
          sizes: CAPTIONED_ZOOM_IMAGE_SIZES,
        })}
        className="image-loading-surface relative block w-full cursor-zoom-in overflow-hidden bg-gray-100"
        style={{
          aspectRatio: `${post.coverDimensions.width} / ${post.coverDimensions.height}`,
        }}
      >
        <Image
          src={coverImage}
          alt={coverImageAlt ?? title}
          fill
          sizes={tileSizes(ratio)}
          className="z-10 object-cover transition-transform duration-700 group-hover:scale-[1.01]"
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
              className="underline decoration-gray-300 underline-offset-2 transition-colors hover:text-sun"
            >
              {location.name}
            </a>
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <Link
          href={`/${post.slug}`}
          className="underline decoration-gray-300 underline-offset-2 transition-colors hover:text-sun"
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
      <div className="container pt-4 pb-10 sm:pt-6 sm:pb-12 md:pt-6 md:pb-14">
        <div className="mb-10 flex flex-col items-center text-center md:mb-14">
          <div
            className="mb-4 flex items-center justify-center gap-2 font-mono text-xs text-gray-500"
            aria-label={`Trip dates: ${TRIP_START} to ${TRIP_END}`}
          >
            <time dateTime={TRIP_START}>{TRIP_START}</time>
            <span aria-hidden="true">
              <ArrowIcon className="h-3.5 w-3.5 text-sun" />
            </span>
            <time dateTime={TRIP_END}>{TRIP_END}</time>
          </div>
          <Link
            href="/tsundoku"
            aria-label="Tsundoku"
            className="block transition-opacity hover:opacity-80"
          >
            <Image
              src="/images/tsundoku.svg"
              alt="Tsundoku"
              width={300}
              height={46}
              sizes="(max-width: 640px) 68vw, 300px"
              className="h-auto w-full max-w-[68vw] sm:max-w-[280px] md:max-w-[300px]"
              priority
            />
          </Link>
          <h1 className="sr-only">Tsundoku</h1>
          <div className="mt-4 max-w-[41rem] space-y-2 text-balance font-serif text-base leading-relaxed text-gray-600 sm:text-lg">
            {INTRO.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <p>
              {INTRO_FINAL}{' '}
              <Link
                href="/introducing-tsundoku"
                className="whitespace-nowrap text-sun underline decoration-sun/30 underline-offset-4 transition-colors hover:text-gray-900 hover:decoration-gray-400"
              >
                Learn more →
              </Link>
            </p>
          </div>
          <SubscribeCta newsletter="tsundoku" align="center" className="mt-5" />
        </div>

        <div className="flex flex-wrap gap-x-2 gap-y-5 [--row-h:160px] sm:gap-y-6 sm:[--row-h:220px] lg:[--row-h:260px]">
          {posts.map((post, index) => (
            <PhotoTile key={post.slug} post={post} index={index} />
          ))}
          <div aria-hidden className="hidden grow-[9999] basis-0 sm:block" />
        </div>
      </div>
    </div>
  )
}
