import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { Newsletter, Page, Post } from '@/lib/content/types'
import { frontmatterSchema } from '@/lib/content/types'

const CONTENT_DIR = path.join(process.cwd(), 'content')

function extractSlug(filename: string): string {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.mdx?$/, '')
}

function extractExcerpt(content: string, maxLength = 200): string {
  const text = content
    .replace(/^---[\s\S]*?---/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#*_`~[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text
}

export function getPostsByNewsletter(newsletter: Newsletter): Post[] {
  const dir = path.join(CONTENT_DIR, newsletter)
  if (!fs.existsSync(dir)) return []

  const files = fs.readdirSync(dir).filter((f) => /\.mdx?$/.test(f))

  return files
    .map((filename) => {
      const filePath = path.join(dir, filename)
      const raw = fs.readFileSync(filePath, 'utf-8')
      const { data, content } = matter(raw)
      const parsed = frontmatterSchema.safeParse(data)

      if (!parsed.success) {
        console.warn(`Invalid frontmatter in ${filename}:`, parsed.error)
        return null
      }

      if (parsed.data.draft) return null

      return {
        slug: extractSlug(filename),
        newsletter,
        frontmatter: parsed.data,
        content,
        excerpt: parsed.data.description ?? extractExcerpt(content),
      } satisfies Post
    })
    .filter((p): p is Post => p !== null)
    .sort(
      (a, b) =>
        new Date(b.frontmatter.publishedAt).getTime() -
        new Date(a.frontmatter.publishedAt).getTime()
    )
}

export function getAllPosts(): Post[] {
  const newsletters: Newsletter[] = ['contraption', 'workshop', 'postcard']
  return newsletters
    .flatMap((n) => getPostsByNewsletter(n))
    .sort(
      (a, b) =>
        new Date(b.frontmatter.publishedAt).getTime() -
        new Date(a.frontmatter.publishedAt).getTime()
    )
}

export function getPostBySlug(slug: string): Post | null {
  const all = getAllPosts()
  return all.find((p) => p.slug === slug) ?? null
}

export function getPages(): Page[] {
  const dir = path.join(CONTENT_DIR, 'pages')
  if (!fs.existsSync(dir)) return []

  return fs
    .readdirSync(dir)
    .filter((f) => /\.mdx?$/.test(f))
    .map((filename) => {
      const filePath = path.join(dir, filename)
      const raw = fs.readFileSync(filePath, 'utf-8')
      const { data, content } = matter(raw)
      const parsed = frontmatterSchema.safeParse(data)

      if (!parsed.success) return null
      if (parsed.data.draft) return null

      return {
        slug: filename.replace(/\.mdx?$/, ''),
        frontmatter: parsed.data,
        content,
      } satisfies Page
    })
    .filter((p): p is Page => p !== null)
}

export function getPageBySlug(slug: string): Page | null {
  return getPages().find((p) => p.slug === slug) ?? null
}
