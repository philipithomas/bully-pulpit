import { format } from 'date-fns'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
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
  const isWorkshop = post?.newsletter === 'workshop'

  return (
    <article className={isWorkshop ? 'bg-offwhite-warm' : undefined}>
      <JsonLd
        type="article"
        post={post ?? undefined}
        page={page ?? undefined}
      />
      <div className="container py-12 md:py-16 max-w-3xl mx-auto">
        {/* Header */}
        <header className="mb-10">
          {post && (
            <time className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500">
              {format(new Date(item.frontmatter.publishedAt), 'yyyy-MM-dd')}
            </time>
          )}
          <h1 className="font-sans font-semibold text-3xl sm:text-4xl md:text-5xl tracking-tight text-gray-950 mt-3">
            {item.frontmatter.title}
          </h1>
          {item.frontmatter.description && (
            <p className="font-serif text-gray-600 text-lg sm:text-xl max-w-prose leading-relaxed mt-4">
              {item.frontmatter.description}
            </p>
          )}
        </header>

        {/* Cover image */}
        {item.frontmatter.coverImage && (
          <div className="relative aspect-[2/1] overflow-hidden rounded-sm mb-10">
            <Image
              src={item.frontmatter.coverImage}
              alt={item.frontmatter.coverImageAlt ?? item.frontmatter.title}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 768px) 100vw, 768px"
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
