import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { SetNewsletter } from '@/components/layout/newsletter-context'
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
import { feedDiscovery } from '@/lib/feeds/discovery'

interface Props {
  params: Promise<{ slug: string }>
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
      // Fall back to the site image when the item has no cover.
      images: [{ url: item.frontmatter.coverImage ?? siteConfig.image }],
    },
    twitter: {
      card: 'summary_large_image',
      title: item.frontmatter.title,
      description,
      // Page-level twitter metadata replaces the root layout's, so mirror
      // the openGraph image fallback here as well.
      images: [{ url: item.frontmatter.coverImage ?? siteConfig.image }],
    },
  }
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  const page = post ? null : getPageBySlug(slug)

  if (!post && !page) notFound()

  // Build-time syntax highlighting; the singleton resolves once per worker.
  const highlighter = await getHighlighter()

  const item = post ?? page!
  const relatedPosts = post ? getRelatedPosts(post.slug) : []
  const { previous, next } = post
    ? getAdjacentPosts(post.slug)
    : { previous: null, next: null }
  const bgMap: Record<string, { className: string; dataBg: string }> = {
    workshop: { className: 'bg-offwhite-warm', dataBg: 'offwhite-warm' },
    contraption: { className: 'bg-gray-050', dataBg: 'gray-050' },
    postcard: { className: 'bg-offwhite-cool', dataBg: 'offwhite-cool' },
  }
  const bg = post?.newsletter ? bgMap[post.newsletter] : undefined

  return (
    <article className={bg?.className} data-bg={bg?.dataBg}>
      <SetNewsletter newsletter={post?.newsletter ?? null} />
      <JsonLd
        type={post ? 'article' : 'webpage'}
        post={post ?? undefined}
        page={page ?? undefined}
      />
      <div className="container py-12 md:py-16">
        {/* Header */}
        <header className="flex flex-col items-center text-center mx-auto max-w-3xl mb-10">
          {post &&
            post.newsletter !== 'postcard' &&
            post.frontmatter.publishedAt && (
              <time className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500">
                {post.frontmatter.publishedAt}
              </time>
            )}
          <h1 className="font-sans font-semibold text-3xl leading-tight tracking-tight text-gray-950 sm:text-4xl md:text-5xl lg:text-6xl text-pretty mt-3">
            {item.frontmatter.title}
          </h1>
          {item.frontmatter.description && (
            <p className="font-serif text-gray-600 text-lg sm:text-xl max-w-prose leading-relaxed mt-4">
              {item.frontmatter.description}
            </p>
          )}
          {post && (
            <a href="/" className="flex items-center gap-3 mt-6 group">
              <Image
                src="/images/author.jpg"
                alt="Philip I. Thomas"
                width={36}
                height={36}
                className="w-9 h-9 rounded-full"
              />
              <span
                className={`font-sans text-sm font-medium text-gray-600 ${accentHoverText[post.newsletter]} transition-colors duration-300`}
              >
                Philip I. Thomas
              </span>
            </a>
          )}
        </header>

        {/* Cover image */}
        {item.frontmatter.coverImage && (
          <div className="w-full overflow-hidden mb-10">
            <Image
              src={item.frontmatter.coverImage}
              alt={item.frontmatter.coverImageAlt ?? item.frontmatter.title}
              width={post?.coverDimensions?.width ?? 1280}
              height={post?.coverDimensions?.height ?? 640}
              data-zoomable=""
              {...(post?.fullCoverImage
                ? { 'data-full-src': post.fullCoverImage }
                : {})}
              className="w-full cursor-zoom-in"
              priority
              sizes={POST_COVER_SIZES}
            />
          </div>
        )}

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
        {post && <SubscribeCta newsletter={post.newsletter} />}

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
