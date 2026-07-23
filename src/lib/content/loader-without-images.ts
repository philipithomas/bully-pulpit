import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { comparePostsNewestFirst } from '@/lib/content/post-order'
import type { Newsletter, Post } from '@/lib/content/types'
import { frontmatterSchema, NEWSLETTERS } from '@/lib/content/types'

const CONTENT_DIR = path.join(process.cwd(), 'content')

function extractSlug(filename: string): string {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.mdx?$/, '')
}

function extractExcerpt(content: string, maxLength = 200): string {
  const text = content
    .replace(/^---[\s\S]*?---/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`~[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text
}

export function getPostsByNewsletterWithoutImages(
  newsletter: Newsletter
): Post[] {
  const dir = path.join(CONTENT_DIR, newsletter)
  if (!fs.existsSync(dir)) return []

  const files = fs.readdirSync(dir).filter((f) => /\.mdx?$/.test(f))

  const posts = files
    .map((filename) => {
      const filePath = path.join(dir, filename)
      const raw = fs.readFileSync(filePath, 'utf-8')
      const { data, content } = matter(raw)
      const parsed = frontmatterSchema.safeParse(data)

      if (!parsed.success) {
        throw new Error(
          `Invalid frontmatter in ${filename}: ${parsed.error.message}`
        )
      }

      if (parsed.data.draft) return null
      if (!parsed.data.publishedAt) return null

      return {
        slug: extractSlug(filename),
        newsletter,
        frontmatter: { ...parsed.data, publishedAt: parsed.data.publishedAt },
        content,
        excerpt: parsed.data.description ?? extractExcerpt(content),
      } as Post
    })
    .filter((p): p is Post => p !== null)

  return posts.sort(comparePostsNewestFirst)
}

export function getAllPostsWithoutImages(): Post[] {
  return newsletters
    .flatMap((n) => getPostsByNewsletterWithoutImages(n))
    .sort(comparePostsNewestFirst)
}

const newsletters: readonly Newsletter[] = NEWSLETTERS

export function getPostBySlugWithoutImages(slug: string): Post | null {
  const all = getAllPostsWithoutImages()
  return all.find((p) => p.slug === slug) ?? null
}
