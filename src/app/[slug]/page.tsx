import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { SetNewsletter } from '@/components/layout/newsletter-context'
import { ContactPage } from '@/components/pages/contact-page'
import { StargazingPage } from '@/components/pages/stargazing-page'
import { TextMessagingPage } from '@/components/pages/text-messaging-page'
import {
  createHeadingComponents,
  mdxComponents,
} from '@/components/posts/mdx-components'
import { accentHoverText } from '@/components/posts/newsletter-accent'
import { PostNavigation } from '@/components/posts/post-navigation'
import { RelatedPosts } from '@/components/posts/related-posts'
import { SubscribeCta } from '@/components/posts/subscribe-cta'
import { JsonLd } from '@/components/seo/json-ld'
import { SpotifyEmbed } from '@/components/ui/spotify-embed'
import { YouTubeEmbed } from '@/components/ui/youtube-embed'
import { siteConfig } from '@/lib/config'
import { POST_COVER_SIZES } from '@/lib/content/cover-preload'
import { codeThemeName, getHighlighter } from '@/lib/content/highlighter'
import {
  extractExcerpt,
  getAdjacentPosts,
  getAllPosts,
  getPageBySlug,
  getPages,
  getPostBySlug,
} from '@/lib/content/loader'
import { getRelatedPosts } from '@/lib/content/related'
import { markdownToPlaintext } from '@/lib/content/render-html'
import type { Post } from '@/lib/content/types'
import {
  CAPTIONED_ZOOM_IMAGE_SIZES,
  zoomImageDataAttrs,
} from '@/lib/content/zoom-image'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { sitePhoneDisplayNumber, sitePhoneNumber } from '@/lib/phone/config'

interface Props {
  params: Promise<{ slug: string }>
}

const SOCIAL_IMAGE_WIDTH = 1200
const SOCIAL_IMAGE_QUALITY = 100
const FALLBACK_SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 } as const
const PHOTO_VIEWER_DESCRIPTION_MAX = 900

function photoViewerDescription(post: Post): string {
  const text =
    post.frontmatter.description ??
    markdownToPlaintext(post.content, PHOTO_VIEWER_DESCRIPTION_MAX + 1)

  return text.length > PHOTO_VIEWER_DESCRIPTION_MAX
    ? `${text.slice(0, PHOTO_VIEWER_DESCRIPTION_MAX).trimEnd()}...`
    : text
}

function toVercelImagePath(
  imagePath: string,
  width = SOCIAL_IMAGE_WIDTH,
  quality = SOCIAL_IMAGE_QUALITY
): string {
  const params = new URLSearchParams({
    url: imagePath,
    w: String(width),
    q: String(quality),
  })
  return `/_next/image?${params.toString()}`
}

function getScaledSocialDimensions(dimensions?: {
  width: number
  height: number
}): { width: number; height?: number } {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return { width: SOCIAL_IMAGE_WIDTH }
  }

  return {
    width: SOCIAL_IMAGE_WIDTH,
    height: Math.round(
      (dimensions.height / dimensions.width) * SOCIAL_IMAGE_WIDTH
    ),
  }
}

function getSocialImage({
  title,
  coverImage,
  coverImageAlt,
  coverDimensions,
}: {
  title: string
  coverImage?: string
  coverImageAlt?: string
  coverDimensions?: { width: number; height: number }
}) {
  if (coverImage?.startsWith('/images/covers/')) {
    return {
      url: toVercelImagePath(coverImage),
      ...getScaledSocialDimensions(coverDimensions),
      alt: coverImageAlt ?? title,
    }
  }

  if (coverImage) {
    return {
      url: coverImage,
      ...(coverDimensions ?? {}),
      alt: coverImageAlt ?? title,
    }
  }

  return {
    url: siteConfig.image,
    ...FALLBACK_SOCIAL_IMAGE_SIZE,
    alt: siteConfig.title,
  }
}

export async function generateStaticParams() {
  const posts = getAllPosts()
  const pages = getPages()
  return [
    ...posts.map((p) => ({ slug: p.slug })),
    ...pages.map((p) => ({ slug: p.slug })),
  ]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  const page = post ? null : getPageBySlug(slug)
  const item = post ?? page

  if (!item) return {}

  const description =
    item.frontmatter.description ?? extractExcerpt(item.content, 160)
  const socialImage = getSocialImage({
    title: item.frontmatter.title,
    coverImage: item.frontmatter.coverImage,
    coverImageAlt: item.frontmatter.coverImageAlt,
    coverDimensions: post?.coverDimensions,
  })

  return {
    title: item.frontmatter.title,
    description,
    alternates: {
      canonical: `/${item.slug}`,
      // Posts lead with their newsletter's feed; standalone pages advertise
      // the full set with the combined feed first.
      types: feedDiscovery(post?.newsletter),
    },
    openGraph: {
      title: item.frontmatter.title,
      description,
      // Page-level openGraph replaces the root layout's, so restate the
      // canonical url and site name here.
      url: `/${item.slug}`,
      siteName: siteConfig.title,
      ...(post
        ? {
            type: 'article',
            publishedTime: post.frontmatter.publishedAt,
            authors: [siteConfig.author],
          }
        : { type: 'website' }),
      images: [socialImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: item.frontmatter.title,
      description,
      // Page-level twitter metadata replaces the root layout's, so mirror
      // the openGraph image fallback here as well.
      images: [socialImage],
    },
    ...(post
      ? {
          icons: {
            icon: [
              {
                url: siteConfig.newsletters[post.newsletter].icon,
                type: 'image/svg+xml',
              },
            ],
            apple: siteConfig.newsletters[post.newsletter].icon,
          },
        }
      : {}),
  }
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  const page = post ? null : getPageBySlug(slug)

  if (!post && !page) notFound()

  if (page?.slug === 'contact') {
    return <ContactPage page={page} />
  }

  if (page?.slug === 'stargazing') {
    return <StargazingPage page={page} />
  }

  if (page?.slug === 'text-messaging') {
    return <TextMessagingPage page={page} />
  }

  // Build-time syntax highlighting; the singleton resolves once per worker.
  const highlighter = await getHighlighter()
  const smsSignupPhoneNumber = sitePhoneNumber()
  const smsSignupDisplayNumber = sitePhoneDisplayNumber()

  const item = post ?? page!
  const relatedPosts = post ? getRelatedPosts(post.slug) : []
  const { previous, next } = post
    ? getAdjacentPosts(post.slug)
    : { previous: null, next: null }
  const bgMap: Record<string, { className: string; dataBg: string }> = {
    workshop: { className: 'bg-offwhite-warm', dataBg: 'offwhite-warm' },
    contraption: { className: 'bg-gray-050', dataBg: 'gray-050' },
    postcard: { className: 'bg-offwhite-cool', dataBg: 'offwhite-cool' },
    tsundoku: { className: 'bg-[#f4f4f2]', dataBg: 'tsundoku' },
  }
  const bg = post?.newsletter ? bgMap[post.newsletter] : undefined
  const location = post?.frontmatter.location ?? null
  const locationHoverText = post ? accentHoverText[post.newsletter] : ''
  const postDate =
    post && post.newsletter !== 'postcard' ? post.frontmatter.publishedAt : null
  const showPostMetadata = Boolean(postDate || location)
  const isTsundokuPost = post?.newsletter === 'tsundoku'
  const coverZoomCaption = isTsundokuPost
    ? {
        'data-zoom-caption-href': `/${post.slug}`,
        'data-zoom-caption-title': post.frontmatter.title,
        'data-zoom-caption-description': photoViewerDescription(post),
        'data-zoom-caption-date': post.frontmatter.publishedAt,
        'data-zoom-caption-location-name': location?.name,
        'data-zoom-caption-location-url': location?.url,
      }
    : {}

  return (
    <article className={bg?.className} data-bg={bg?.dataBg}>
      <SetNewsletter newsletter={post?.newsletter ?? null} />
      <JsonLd
        type={post ? 'article' : 'webpage'}
        post={post ?? undefined}
        page={page ?? undefined}
      />
      <div
        className={
          isTsundokuPost
            ? 'container pt-8 pb-12 md:pt-10 md:pb-16'
            : 'container py-12 md:py-16'
        }
      >
        {/* Header */}
        <header
          className={`mx-auto flex max-w-3xl flex-col items-center text-center ${isTsundokuPost ? 'mb-6' : 'mb-10'}`}
        >
          {showPostMetadata ? (
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-xs text-gray-500">
              {postDate ? <time>{postDate}</time> : null}
              {postDate && location ? <span aria-hidden="true">@</span> : null}
              {location ? (
                <a
                  href={location.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline decoration-gray-300 underline-offset-2 ${locationHoverText} transition-colors duration-300`}
                >
                  {location.name}
                </a>
              ) : null}
            </div>
          ) : null}
          <h1
            className={`mt-3 font-sans font-semibold leading-tight tracking-tight text-pretty text-gray-950 ${
              isTsundokuPost
                ? 'text-3xl sm:text-4xl md:text-5xl'
                : 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl'
            }`}
          >
            {item.frontmatter.title}
          </h1>
          {item.frontmatter.description ? (
            <p className="font-serif text-gray-600 text-lg sm:text-xl max-w-prose leading-relaxed mt-4">
              {item.frontmatter.description}
            </p>
          ) : null}
          {post && !isTsundokuPost && (
            <a href="/" className="flex items-center gap-3 mt-6 group">
              <Image
                src="/images/author.jpg"
                alt={siteConfig.author}
                width={36}
                height={36}
                className="w-9 h-9 rounded-full"
              />
              <span
                className={`font-sans text-sm font-medium uppercase tracking-[0.04em] text-gray-600 ${accentHoverText[post.newsletter]} transition-colors duration-300`}
              >
                {siteConfig.author}
              </span>
            </a>
          )}
        </header>

        {/* Cover image */}
        {item.frontmatter.coverImage ? (
          <div
            className={`image-loading-surface w-full overflow-hidden ${isTsundokuPost ? 'mb-8' : 'mb-10'}`}
          >
            <Image
              src={item.frontmatter.coverImage}
              alt={item.frontmatter.coverImageAlt ?? item.frontmatter.title}
              width={post?.coverDimensions?.width ?? 1280}
              height={post?.coverDimensions?.height ?? 640}
              data-zoomable=""
              {...zoomImageDataAttrs({
                src: item.frontmatter.coverImage,
                dimensions: post?.coverDimensions,
                sizes: isTsundokuPost ? CAPTIONED_ZOOM_IMAGE_SIZES : undefined,
              })}
              {...coverZoomCaption}
              className="relative z-10 block w-full cursor-zoom-in"
              priority
              sizes={POST_COVER_SIZES}
            />
          </div>
        ) : null}

        {/* Content */}
        <div className="prose prose-xl font-serif mx-auto max-w-2xl">
          <MDXRemote
            source={item.content}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkGfm],
                rehypePlugins: [
                  [
                    rehypeShikiFromHighlighter,
                    highlighter,
                    // Unknown fence languages render as plain text on the
                    // same surface instead of failing the build.
                    { theme: codeThemeName, fallbackLanguage: 'text' },
                  ],
                ],
              },
            }}
            components={{
              SpotifyEmbed,
              YouTubeEmbed,
              ...mdxComponents,
              ...createHeadingComponents(),
            }}
          />
        </div>

        {/* Subscribe CTA for posts */}
        {post && (
          <SubscribeCta
            newsletter={post.newsletter}
            smsSignupDisplayNumber={smsSignupDisplayNumber}
            smsSignupPhoneNumber={smsSignupPhoneNumber}
          />
        )}

        {/* Previous and next posts in the same newsletter */}
        {post && <PostNavigation previous={previous} next={next} />}

        {/* Related posts */}
        {post && relatedPosts.length > 0 && (
          <RelatedPosts posts={relatedPosts} />
        )}
      </div>
    </article>
  )
}
