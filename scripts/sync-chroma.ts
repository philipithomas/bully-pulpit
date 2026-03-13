import crypto from 'node:crypto'
import { getClient, getPostsSchema } from '@/lib/chroma'
import { getAllPosts, getPages } from '@/lib/content/loader'

interface DocEntry {
  id: string
  document: string
  metadata: Record<string, string | number>
}

function hash(...parts: string[]): string {
  return crypto
    .createHash('sha256')
    .update(parts.join('\0'))
    .digest('hex')
    .slice(0, 16)
}

function buildDocuments(): DocEntry[] {
  const docs: DocEntry[] = []

  for (const post of getAllPosts()) {
    const url = `https://www.philipithomas.com/${post.slug}`

    // Title chunk
    const titleDoc = [
      post.frontmatter.title,
      post.frontmatter.subtitle ?? post.frontmatter.description ?? '',
    ]
      .filter(Boolean)
      .join('. ')

    docs.push({
      id: `${post.slug}-title`,
      document: titleDoc,
      metadata: {
        slug: post.slug,
        title: post.frontmatter.title,
        url,
        newsletter: post.newsletter,
        category: 'post',
        type: 'title',
        coverImage: post.frontmatter.coverImage ?? '',
        hash: hash(titleDoc, post.frontmatter.coverImage ?? ''),
      },
    })

    // Content chunks — line-by-line
    const lines = post.content.split('\n').filter((l) => l.trim().length > 0)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      docs.push({
        id: `${post.slug}-line-${i}`,
        document: line,
        metadata: {
          slug: post.slug,
          title: post.frontmatter.title,
          url,
          newsletter: post.newsletter,
          category: 'post',
          type: 'content',
          coverImage: post.frontmatter.coverImage ?? '',
          line: i,
          hash: hash(line, post.frontmatter.coverImage ?? ''),
        },
      })
    }

    // Cover image chunk
    if (post.frontmatter.coverImage && post.frontmatter.coverImageAlt) {
      const altText = post.frontmatter.coverImageAlt
      docs.push({
        id: `${post.slug}-cover`,
        document: altText,
        metadata: {
          slug: post.slug,
          title: post.frontmatter.title,
          url,
          newsletter: post.newsletter,
          category: 'image',
          type: 'image',
          coverImage: post.frontmatter.coverImage,
          hash: hash(altText),
        },
      })
    }
  }

  for (const page of getPages()) {
    const url = `https://www.philipithomas.com/${page.slug}`

    const titleDoc = [
      page.frontmatter.title,
      page.frontmatter.description ?? '',
    ]
      .filter(Boolean)
      .join('. ')

    docs.push({
      id: `${page.slug}-title`,
      document: titleDoc,
      metadata: {
        slug: page.slug,
        title: page.frontmatter.title,
        url,
        newsletter: 'page',
        category: 'post',
        type: 'title',
        hash: hash(titleDoc),
      },
    })

    const lines = page.content.split('\n').filter((l) => l.trim().length > 0)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      docs.push({
        id: `${page.slug}-line-${i}`,
        document: line,
        metadata: {
          slug: page.slug,
          title: page.frontmatter.title,
          url,
          newsletter: 'page',
          category: 'post',
          type: 'content',
          line: i,
          hash: hash(line),
        },
      })
    }
  }

  return docs
}

async function main() {
  const client = getClient()
  const collection = await client.getOrCreateCollection({
    name: 'posts',
    schema: getPostsSchema(),
  })

  const docs = buildDocuments()
  const newIds = new Set(docs.map((d) => d.id))

  console.log(`Built ${docs.length} documents from content`)

  // Fetch all existing records to diff (paginate past default limit)
  const existingMap = new Map<string, string>()
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
      if (meta?.hash) {
        existingMap.set(page.ids[i], meta.hash as string)
      }
    }
    offset += page.ids.length
    if (page.ids.length < pageSize) break
  }

  console.log(`Found ${existingMap.size} existing documents in Chroma`)

  // Delete removed documents
  const toDelete = [...existingMap.keys()].filter((id) => !newIds.has(id))
  if (toDelete.length > 0) {
    for (let i = 0; i < toDelete.length; i += 300) {
      await collection.delete({ ids: toDelete.slice(i, i + 300) })
    }
    console.log(`Deleted ${toDelete.length} removed documents`)
  }

  // Filter to only changed/new documents
  const toUpsert = docs.filter((d) => {
    const existingHash = existingMap.get(d.id)
    return existingHash !== d.metadata.hash
  })

  if (toUpsert.length === 0) {
    console.log('No changes detected — sync is a no-op')
    return
  }

  console.log(`Upserting ${toUpsert.length} changed/new documents`)

  // Batch upserts: 50 per batch, 3 concurrent writers
  const BATCH_SIZE = 50
  const CONCURRENCY = 3
  const batches: DocEntry[][] = []
  for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
    batches.push(toUpsert.slice(i, i + BATCH_SIZE))
  }

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY)
    await Promise.all(
      chunk.map((batch) =>
        collection.upsert({
          ids: batch.map((d) => d.id),
          documents: batch.map((d) => d.document),
          metadatas: batch.map((d) => d.metadata),
        })
      )
    )
    const done = Math.min(i + CONCURRENCY, batches.length)
    console.log(`  Upserted ${done}/${batches.length} batches`)
  }

  console.log('Sync complete')
}

main().catch((err) => {
  console.error('Sync failed:', err)
  process.exit(1)
})
