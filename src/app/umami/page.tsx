import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { SmsSubscribePrompt } from '@/components/auth/sms-subscribe-prompt'
import { SubscribeCta } from '@/components/posts/subscribe-cta'
import { UmamiTagline } from '@/components/umami/umami-tagline'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { markdownToPlaintext } from '@/lib/content/render-html'
import type { Post } from '@/lib/content/types'
import { zoomImageDataAttrs } from '@/lib/content/zoom-image'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { sitePhoneDisplayNumber, sitePhoneNumber } from '@/lib/phone/config'
import { publicAppPage } from '@/lib/public-pages'

const umamiPage = publicAppPage('/umami')
const umamiSocialTitle = `${umamiPage.title} | ${siteConfig.title}`

export const metadata: Metadata = {
  title: umamiPage.title,
  description: umamiPage.description,
  alternates: {
    canonical: '/umami',
    types: feedDiscovery('umami'),
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/umami',
    siteName: siteConfig.title,
    title: umamiSocialTitle,
    description: umamiPage.description,
    images: [{ url: siteConfig.image, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: umamiSocialTitle,
    description: umamiPage.description,
    images: [{ url: siteConfig.image, width: 1200, height: 630 }],
  },
  icons: {
    icon: [{ url: siteConfig.newsletters.umami.icon, type: 'image/svg+xml' }],
    apple: siteConfig.newsletters.umami.icon,
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
    'data-zoom-group': 'umami',
    'data-zoom-caption-presentation': 'immersive',
    'data-zoom-caption-collection': 'umami',
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
    <figure className="mx-auto w-full" style={{ maxWidth: `${ratio * 80}svh` }}>
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

export default function UmamiPage() {
  const posts = getPostsByNewsletter('umami')
  const [leadPost, ...archivePosts] = posts
  const smsSignupPhoneNumber = sitePhoneNumber()
  const smsSignupDisplayNumber = sitePhoneDisplayNumber()

  return (
    <div className="bg-umami-paper" data-bg="umami">
      <div className="umami-page-shell container pt-4 pb-10 sm:pt-6 sm:pb-12 md:pb-14">
        <div className="umami-page-intro mb-12 grid gap-7 text-center sm:mb-14 md:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] md:items-end md:gap-12 md:text-left">
          <div className="umami-page-brand flex flex-col items-center md:items-start">
            <Link
              href="/umami"
              aria-label="umami"
              className="block transition-opacity hover:opacity-80"
            >
              <Image
                src="/images/umami.svg"
                alt="umami"
                width={1562}
                height={369}
                sizes="(max-width: 640px) 52vw, (max-width: 768px) 220px, 240px"
                className="h-auto w-full max-w-[52vw] sm:max-w-[220px] md:max-w-[240px]"
                priority
              />
            </Link>
            <h1 className="sr-only">umami</h1>
            <UmamiTagline />
          </div>
          <div className="umami-page-signup w-full md:max-w-md md:justify-self-end">
            <SubscribeCta
              newsletter="umami"
              analyticsPlacement="newsletter_page"
              align="start"
              className="umami-page-email mt-0 md:mx-0"
              subscribeEndpoint="/api/subscribe/umami"
            />
            {smsSignupPhoneNumber ? (
              <p className="umami-page-sms text-left font-serif text-sm text-gray-500">
                Also available via{' '}
                <SmsSubscribePrompt
                  analyticsPlacement="newsletter_page"
                  newsletter="umami"
                  phoneDisplayNumber={smsSignupDisplayNumber}
                  phoneNumber={smsSignupPhoneNumber}
                  triggerClassName="decoration-umami/60 hover:text-umami-ink"
                  triggerLabel="SMS"
                  variant="link"
                />
                .
              </p>
            ) : null}
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
