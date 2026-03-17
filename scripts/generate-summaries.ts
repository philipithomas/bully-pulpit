import crypto from 'node:crypto'
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { getClient, getPostSummariesSchema } from '@/lib/chroma'
import { getAllPosts } from '@/lib/content/loader'

const SUMMARY_PROMPT = `You are summarizing a blog post for use as an embedding document in a semantic similarity search system. Your summary will be used to find related posts.

Rules:
- Begin with the post title woven naturally into the opening sentence
- Focus on themes, concepts, arguments, and takeaways
- Minimize proper nouns (they cluster embeddings around entities, not concepts)
- No keyword lists or meta-language ("this post discusses...")
- Active voice, no contractions, no em dashes, never use the word "very"
- Oxford commas
- Third person / neutral voice
- 150-300 words, dense with thematic meaning
- Write prose paragraphs, not bullet points`

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
}

async function main() {
  const args = process.argv.slice(2)
  const forceAll = args.includes('--force-all')
  const forceIndex = args.indexOf('--force')
  const forceSlug = forceIndex !== -1 && !forceAll ? args[forceIndex + 1] : null

  const posts = getAllPosts()
  console.log(`Found ${posts.length} posts`)

  const client = getClient()
  const collection = await client.getOrCreateCollection({
    name: 'post_summaries',
    schema: getPostSummariesSchema(),
  })

  // Fetch existing documents
  const existingMap = new Map<string, { hash: string }>()
  let offset = 0
  const pageSize = 300
  while (true) {
    const page = await collection.get({
      include: ['metadatas'],
      limit: pageSize,
      offset,
    })
    if (page.ids.length === 0) break
    for (let i = 0; i < page.ids.length; i++) {
      const meta = page.metadatas[i]
      if (meta) {
        existingMap.set(page.ids[i], { hash: (meta.hash as string) ?? '' })
      }
    }
    offset += page.ids.length
    if (page.ids.length < pageSize) break
  }

  console.log(`Found ${existingMap.size} existing summaries in Chroma`)

  // Check for stale summaries
  for (const post of posts) {
    const existing = existingMap.get(post.slug)
    if (existing && existing.hash !== hashContent(post.content)) {
      console.log(`  STALE: ${post.slug} (content hash changed)`)
    }
  }

  // Determine which posts need summaries
  const toProcess = posts.filter((post) => {
    if (forceAll) return true
    if (forceSlug) return post.slug === forceSlug
    return !existingMap.has(post.slug)
  })

  if (forceSlug && toProcess.length === 0) {
    console.error(`Post not found: ${forceSlug}`)
    process.exit(1)
  }

  if (toProcess.length === 0) {
    console.log('No summaries to generate')
    return
  }

  console.log(`Generating summaries for ${toProcess.length} posts`)

  const model = openai('gpt-5.4')

  for (const post of toProcess) {
    console.log(`  Summarizing: ${post.slug}`)

    const { text } = await generateText({
      model,
      providerOptions: { openai: { reasoningEffort: 'medium' } },
      prompt: `${SUMMARY_PROMPT}\n\n---\n\nTitle: ${post.frontmatter.title}\n\n${post.content}`,
    })

    const url = `https://www.philipithomas.com/${post.slug}`
    await collection.upsert({
      ids: [post.slug],
      documents: [text],
      metadatas: [
        {
          slug: post.slug,
          title: post.frontmatter.title,
          url,
          newsletter: post.newsletter,
          coverImage: post.frontmatter.coverImage ?? '',
          hash: hashContent(post.content),
        },
      ],
    })

    console.log(`    Done (${text.length} chars)`)
  }

  console.log('Summary generation complete')
}

main().catch((err) => {
  console.error('Summary generation failed:', err)
  process.exit(1)
})
