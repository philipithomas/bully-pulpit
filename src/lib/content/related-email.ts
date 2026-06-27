import fs from 'node:fs'
import path from 'node:path'
import { getPostBySlugWithoutImages } from '@/lib/content/loader-without-images'
import type { Post } from '@/lib/content/types'

interface RelatedPostsData {
  posts: Record<string, { related: { slug: string; score: number }[] }>
}

const JSON_PATH = path.join(process.cwd(), 'src/generated/related-posts.json')

export function getRelatedPostsForEmail(slug: string): Post[] {
  if (!fs.existsSync(JSON_PATH)) return []

  const data: RelatedPostsData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
  const entry = data.posts[slug]
  if (!entry) return []

  return entry.related
    .map((r) => getPostBySlugWithoutImages(r.slug))
    .filter((p): p is Post => p !== null)
}
