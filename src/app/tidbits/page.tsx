import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { SubscribeCta } from '@/components/posts/subscribe-cta'
import { TidbitsSmsSignup } from '@/components/tidbits/tidbits-sms-signup'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { markdownToPlaintext } from '@/lib/content/render-html'
import type { Post } from '@/lib/content/types'
import { zoomImageDataAttrs } from '@/lib/content/zoom-image'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { sitePhoneDisplayNumber, sitePhoneNumber } from '@/lib/phone/config'
import { publicAppPage } from '@/lib/public-pages'

const tidbitsPage = publicAppPage('/tidbits')
const tidbitsSocialTitle = `${tidbitsPage.title} | ${siteConfig.title}`

export const metadata: Metadata = {
  title: tidbitsPage.title,
  description: tidbitsPage.description,
  alternates: {
    canonical: '/tidbits',
    types: feedDiscovery('tidbits'),
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/tidbits',
    siteName: siteConfig.title,
    title: tidbitsSocialTitle,
    description: tidbitsPage.description,
    images: [{ url: siteConfig.image, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: tidbitsSocialTitle,
    description: tidbitsPage.description,
    images: [{ url: siteConfig.image, width: 1200, height: 630 }],
  },
  icons: {
    icon: [{ url: siteConfig.newsletters.tidbits.icon, type: 'image/svg+xml' }],
    apple: siteConfig.newsletters.tidbits.icon,
  },
}

const ROW_HEIGHT = 280
const MAX_ROW_WIDTH = 1216
const STRETCH = 1.25
const PHOTO_VIEWER_DESCRIPTION_MAX = 900
const LEAD_IMAGE_SIZES =
  '(max-width: 640px) 100vw, (max-width: 1280px) calc(100vw - 4rem), 1216px'

function postPath(slug: string): string {
  return `/${encodeURIComponent(slug)}`
}

function photoViewerDescription(post: Post): string | undefined {
  const text = (
    post.frontmatter.description ??
    markdownToPlaintext(post.content, PHOTO_VIEWER_DESCRIPTION_MAX + 1)
  ).trim()

  if (!text) return undefined
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

function viewerData(post: Post) {
  const { location } = post.frontmatter
  return {
    'data-zoomable': '',
    'data-zoom-group': 'tidbits',
    'data-zoom-caption-presentation': 'immersive',
    'data-zoom-caption-collection': 'tidbits',
    'data-zoom-caption-href': postPath(post.slug),
    'data-zoom-caption-title': post.frontmatter.title,
    'data-zoom-caption-description': photoViewerDescription(post),
    'data-zoom-caption-date': post.frontmatter.publishedAt,
    'data-zoom-caption-location': location?.name,
    'data-zoom-caption-location-href': location?.url,
    ...zoomImageDataAttrs({
      src: post.frontmatter.coverImage!,
      dimensions: post.coverDimensions,
      sizes: '100vw',
    }),
  }
}

function LeadPhoto({ post }: { post: Post }) {
  const { coverImage, coverImageAlt, title } = post.frontmatter
  if (!coverImage || !post.coverDimensions) return null
  const ratio = post.coverDimensions.width / post.coverDimensions.height

  return (
    <figure className="w-full" style={{ maxWidth: `${ratio * 80}svh` }}>
      <a
        href={postPath(post.slug)}
        aria-label={coverImageAlt ?? title}
        aria-haspopup="dialog"
        {...viewerData(post)}
        className="image-loading-surface group relative flex max-h-[80svh] w-full cursor-zoom-in items-center justify-center overflow-hidden bg-gray-100"
        style={{
          aspectRatio: `${post.coverDimensions.width} / ${post.coverDimensions.height}`,
        }}
      >
        <Image
          src={coverImage}
          alt={coverImageAlt ?? title}
          fill
          sizes={LEAD_IMAGE_SIZES}
          className="z-10 object-contain transition-transform duration-700 group-hover:scale-[1.005]"
          priority
        />
      </a>
    </figure>
  )
}

function PhotoTile({ post }: { post: Post }) {
  const { coverImage, coverImageAlt, title } = post.frontmatter
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
      <a
        href={postPath(post.slug)}
        aria-label={coverImageAlt ?? title}
        aria-haspopup="dialog"
        {...viewerData(post)}
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
        />
      </a>
    </figure>
  )
}

export default function TidbitsPage() {
  const posts = getPostsByNewsletter('tidbits')
  const [leadPost, ...archivePosts] = posts
  const smsSignupPhoneNumber = sitePhoneNumber()
  const smsSignupDisplayNumber = sitePhoneDisplayNumber()

  return (
    <div className="bg-tidbits-paper" data-bg="tidbits">
      <div className="tidbits-page-shell container pt-4 pb-10 sm:pt-6 sm:pb-12 md:pb-14">
        <div className="tidbits-page-intro mb-12 grid gap-7 text-center sm:mb-14 md:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] md:items-end md:gap-12 md:text-left">
          <div className="tidbits-page-brand flex flex-col items-center md:items-start">
            <Link
              href="/tidbits"
              aria-label="tidbits"
              className="block transition-opacity hover:opacity-80"
            >
              <Image
                src="/images/tidbits.svg"
                alt="tidbits"
                width={1601}
                height={369}
                sizes="(max-width: 640px) 52vw, (max-width: 768px) 220px, 240px"
                className="h-auto w-full max-w-[52vw] sm:max-w-[220px] md:max-w-[240px]"
                priority
              />
            </Link>
            <h1 className="sr-only">tidbits</h1>
            <p className="mt-4 max-w-xl text-balance font-serif text-base leading-relaxed text-gray-600 sm:text-lg">
              {siteConfig.newsletters.tidbits.tagline}
            </p>
          </div>
          <div className="tidbits-page-signup w-full md:max-w-md md:justify-self-end">
            <SubscribeCta
              newsletter="tidbits"
              analyticsPlacement="newsletter_page"
              align="start"
              buttonClassName="btn btn-primary btn-newsletter"
              buttonLabel="Follow"
              className="tidbits-page-email mt-0 md:mx-0"
              subscribeEndpoint="/api/subscribe/tidbits"
            />
            <TidbitsSmsSignup
              phoneDisplayNumber={smsSignupDisplayNumber}
              phoneNumber={smsSignupPhoneNumber}
            />
          </div>
        </div>

        {leadPost ? <LeadPhoto post={leadPost} /> : null}

        {archivePosts.length > 0 ? (
          <div className="mt-8 flex flex-wrap gap-x-2 gap-y-5 [--row-h:170px] sm:mt-10 sm:gap-y-6 sm:[--row-h:230px] lg:[--row-h:280px]">
            {archivePosts.map((post) => (
              <PhotoTile key={post.slug} post={post} />
            ))}
            <div aria-hidden className="hidden grow-[9999] basis-0 sm:block" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
