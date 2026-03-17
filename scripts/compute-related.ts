import fs from 'node:fs'
import path from 'node:path'
import { getClient, getPostSummariesSchema } from '@/lib/chroma'
import { getAllPosts } from '@/lib/content/loader'

interface RelatedEntry {
  slug: string
  score: number
}

interface RelatedPostsData {
  generatedAt: string
  posts: Record<string, { related: RelatedEntry[] }>
}

const OUTPUT_PATH = path.join(process.cwd(), 'src/generated/related-posts.json')
const BATCH_SIZE = 20
const N_RESULTS = 4 // post itself + 3 related

async function main() {
  const posts = getAllPosts()
  const slugs = new Set(posts.map((p) => p.slug))
  console.log(`Found ${slugs.size} posts`)

  const client = getClient()
  const collection = await client.getOrCreateCollection({
    name: 'post_summaries',
    schema: getPostSummariesSchema(),
  })

  // Fetch all documents with summaries
  const summaries = new Map<string, string>()
  let offset = 0
  const pageSize = 300
  while (true) {
    const page = await collection.get({
      include: ['documents'],
      limit: pageSize,
      offset,
    })
    if (page.ids.length === 0) break
    for (let i = 0; i < page.ids.length; i++) {
      if (page.documents[i]) {
        summaries.set(page.ids[i], page.documents[i] as string)
      }
    }
    offset += page.ids.length
    if (page.ids.length < pageSize) break
  }

  console.log(`Found ${summaries.size} summaries in Chroma`)

  // Build ordered list of slugs with summaries
  const slugsWithSummaries = [...slugs].filter((s) => summaries.has(s))
  const result: RelatedPostsData = {
    generatedAt: new Date().toISOString(),
    posts: {},
  }

  // Initialize all posts with empty related
  for (const slug of slugs) {
    result.posts[slug] = { related: [] }
  }

  // Batch query for related posts
  for (let i = 0; i < slugsWithSummaries.length; i += BATCH_SIZE) {
    const batch = slugsWithSummaries.slice(i, i + BATCH_SIZE)
    const queryTexts = batch.map((slug) => summaries.get(slug)!)

    const response = await collection.query({
      queryTexts,
      nResults: N_RESULTS,
    })

    for (let j = 0; j < batch.length; j++) {
      const slug = batch[j]
      const ids = response.ids[j]
      const distances = response.distances?.[j]

      if (!ids || !distances) continue

      const related: RelatedEntry[] = []
      for (let k = 0; k < ids.length; k++) {
        const relatedSlug = ids[k]
        // Skip self and posts that no longer exist
        if (relatedSlug === slug || !slugs.has(relatedSlug)) continue
        related.push({ slug: relatedSlug, score: distances[k] ?? 0 })
      }

      result.posts[slug] = { related: related.slice(0, 3) }
    }

    const done = Math.min(i + BATCH_SIZE, slugsWithSummaries.length)
    console.log(`  Queried ${done}/${slugsWithSummaries.length} posts`)
  }

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_PATH)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`)
  console.log(`Wrote related posts to ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error('Related posts computation failed:', err)
  process.exit(1)
})
