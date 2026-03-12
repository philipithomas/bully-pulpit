import { format } from 'date-fns'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { SetNewsletter } from '@/components/layout/newsletter-context'
import { SubscribeCta } from '@/components/posts/subscribe-cta'
import { JsonLd } from '@/components/seo/json-ld'
import { siteConfig } from '@/lib/config'
import {
  getAllPosts,
  getPageBySlug,
  getPages,
  getPostBySlug,
} from '@/lib/content/loader'

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

  return {
    title: item.frontmatter.title,
    description: item.frontmatter.description ?? siteConfig.description,
    openGraph: {
      title: item.frontmatter.title,
      description: item.frontmatter.description ?? siteConfig.description,
      type: 'article',
      ...(post?.frontmatter.coverImage && {
        images: [{ url: post.frontmatter.coverImage }],
      }),
    },
  }
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  const page = post ? null : getPageBySlug(slug)

  if (!post && !page) notFound()

  const item = post ?? page!
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
        type="article"
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
                {format(new Date(post.frontmatter.publishedAt), 'yyyy-MM-dd')}
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
              <span className="font-sans text-sm font-medium text-gray-600 group-hover:text-forest transition-colors duration-300">
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
              width={1280}
              height={640}
              data-zoomable=""
              className="w-full cursor-zoom-in"
              priority
              sizes="(min-width: 800px) 100vw, 700px"
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
                rehypePlugins: [rehypeSanitize],
              },
            }}
          />
        </div>

        {/* Subscribe CTA for posts */}
        {post && <SubscribeCta />}
      </div>
    </article>
  )
}
