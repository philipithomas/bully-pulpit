import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type {
  ImageDimensions,
  Newsletter,
  Page,
  Post,
} from '@/lib/content/types'
import { frontmatterSchema } from '@/lib/content/types'

const CONTENT_DIR = path.join(process.cwd(), 'content')
const PUBLIC_DIR = path.join(process.cwd(), 'public')

const dimensionsCache = new Map<string, ImageDimensions>()

function getFullCoverImage(coverImage: string | undefined): string | undefined {
  if (!coverImage) return undefined
  const fullPath = path.join(
    PUBLIC_DIR,
    'images',
    'full',
    coverImage.replace(/^\/images\//, '')
  )
  if (fs.existsSync(fullPath)) {
    return `/images/full/${coverImage.replace(/^\/images\//, '')}`
  }
  return undefined
}

function getCoverDimensions(
  coverImage: string | undefined
): ImageDimensions | undefined {
  if (!coverImage) return undefined
  const cached = dimensionsCache.get(coverImage)
  if (cached) return cached
  const filePath = path.join(PUBLIC_DIR, coverImage)
  if (!fs.existsSync(filePath)) return undefined
  try {
    const buf = fs.readFileSync(filePath)
    const dims = parseImageDimensions(buf)
    if (dims) dimensionsCache.set(coverImage, dims)
    return dims
  } catch {
    return undefined
  }
}

function parseImageDimensions(buf: Buffer): ImageDimensions | undefined {
  // JPEG: scan for SOFn markers
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 1) {
      if (buf[i] !== 0xff) break
      const marker = buf[i + 1]
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = buf.readUInt16BE(i + 5)
        const width = buf.readUInt16BE(i + 7)
        return { width, height }
      }
      const segLen = buf.readUInt16BE(i + 2)
      i += 2 + segLen
    }
  }
  // PNG: IHDR at byte 16
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    return { width, height }
  }
  return undefined
}

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

export function getPostsByNewsletter(newsletter: Newsletter): Post[] {
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
        coverDimensions: getCoverDimensions(parsed.data.coverImage),
        fullCoverImage: getFullCoverImage(parsed.data.coverImage),
      } as Post
    })
    .filter((p): p is Post => p !== null)

  return posts.sort(
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

      if (!parsed.success) {
        throw new Error(
          `Invalid frontmatter in ${filename}: ${parsed.error.message}`
        )
      }
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
