import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const PROJECT_DIR = path.resolve(__dirname, '../')
const CONTENT_DIR = path.join(PROJECT_DIR, 'content')
const PUBLIC_DIR = path.join(PROJECT_DIR, 'public')
const POSTS_IMAGES_DIR = path.join(PUBLIC_DIR, 'images/posts')

const MONTH_MAP: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

interface PostDefinition {
  url: string
  type: 'postcard' | 'contraption'
  slug: string
}

// Build post definitions
const postcardPosts: PostDefinition[] = [
  { month: 'march', year: '2026' },
  { month: 'february', year: '2026' },
  { month: 'january', year: '2026' },
  { month: 'december', year: '2025' },
  { month: 'november', year: '2025' },
  { month: 'october', year: '2025' },
  { month: 'september', year: '2025' },
  { month: 'august', year: '2025' },
  { month: 'july', year: '2025' },
  { month: 'june', year: '2025' },
  { month: 'may', year: '2025' },
  { month: 'april', year: '2025' },
  { month: 'march', year: '2025' },
  { month: 'february', year: '2025' },
  { month: 'january', year: '2025' },
  { month: 'november', year: '2024' },
  { month: 'october', year: '2024' },
  { month: 'september', year: '2024' },
  { month: 'august', year: '2024' },
  { month: 'june', year: '2024' },
  { month: 'may', year: '2024' },
  { month: 'april', year: '2024' },
  { month: 'march', year: '2024' },
  { month: 'february', year: '2024' },
  { month: 'january', year: '2024' },
  { month: 'december', year: '2023' },
  { month: 'november', year: '2023' },
  { month: 'october', year: '2023' },
  { month: 'september', year: '2023' },
  { month: 'august', year: '2023' },
  { month: 'july', year: '2023' },
  { month: 'june', year: '2023' },
  { month: 'may', year: '2023' },
  { month: 'april', year: '2023' },
  { month: 'march', year: '2023' },
  { month: 'february', year: '2023' },
  { month: 'january', year: '2023' },
  { month: 'december', year: '2022' },
  { month: 'november', year: '2022' },
  { month: 'october', year: '2022' },
  { month: 'september', year: '2022' },
  { month: 'august', year: '2022' },
  { month: 'july', year: '2022' },
  { month: 'june', year: '2022' },
].map((p) => ({
  url: `https://www.philipithomas.com/posts/what-i-m-up-to-${p.month}-${p.year}.md`,
  type: 'postcard' as const,
  slug: `${p.month}-${p.year}`,
}))

const contraptionSlugs = [
  'slow-travel-in-paris-discovering-substance-cafe',
  'how-to-replace-social-media-with-a-personal-newsletter',
  'why-i-built-postcard-a-calmer-alternative-to-social-networks',
  'when-are-low-code-prototypes-useful-evaluating-startup-market-and-implementation-risks',
  'sharing-a-project-i-built-postcard',
  'advice-for-marketplace-startups',
  'moonlight-s-pitch-deck',
  'buyers-define-marketplaces',
]

const contraptionPosts: PostDefinition[] = contraptionSlugs.map((slug) => ({
  url: `https://www.philipithomas.com/posts/${slug}.md`,
  type: 'contraption' as const,
  slug,
}))

const allPosts: PostDefinition[] = [...postcardPosts, ...contraptionPosts]

function escapeTitle(title: string): string {
  return title.replace(/"/g, '\\"')
}

function escapeCurlyBracesOutsideCodeBlocks(markdown: string): string {
  // Split on fenced code blocks (``` ... ```) and inline code (` ... `)
  const parts = markdown.split(/(```[\s\S]*?```|`[^`]+`)/g)
  return parts
    .map((part, i) => {
      // Odd indices are code blocks - leave them alone
      if (i % 2 === 1) return part
      // Even indices are regular markdown - escape curly braces
      return part.replace(/\{/g, '\\{').replace(/\}/g, '\\}')
    })
    .join('')
}

function parsePostContent(raw: string): {
  title: string
  publishedAt: string | null
  content: string
} {
  const lines = raw.split('\n')

  let title = ''
  let publishedAt: string | null = null
  let contentStartIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Parse title from first # heading
    if (!title && line.startsWith('# ')) {
      title = line.replace(/^# /, '').trim()
      continue
    }

    // Parse published date
    if (line.startsWith('*Published:')) {
      const match = line.match(/\*Published:\s*(\d{4}-\d{2}-\d{2})\*/)
      if (match) {
        publishedAt = match[1]
      }
      continue
    }

    // Skip permalink line
    if (line.startsWith('*Permalink:')) {
      continue
    }

    // Skip empty lines between header and content
    if (!title || line.trim() === '') {
      if (title && !contentStartIndex) continue
    }

    if (title && publishedAt !== undefined && line.trim() !== '') {
      contentStartIndex = i
      break
    }
  }

  const content = lines.slice(contentStartIndex).join('\n').trim()

  return { title, publishedAt, content }
}

function getPostcardDate(slug: string): string {
  // slug is like "march-2026"
  const parts = slug.split('-')
  const month = parts[0]
  const year = parts[1]
  const monthNum = MONTH_MAP[month.toLowerCase()]
  return `${year}-${monthNum}-01`
}

function getPostcardTitle(slug: string): string {
  // slug is like "march-2026" -> "March 2026"
  const parts = slug.split('-')
  const month = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  const year = parts[1]
  return `${month} ${year}`
}

async function downloadImage(
  imageUrl: string,
  destPath: string
): Promise<boolean> {
  try {
    const destDir = path.dirname(destPath)
    fs.mkdirSync(destDir, { recursive: true })

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; migration-script)',
      },
      redirect: 'follow',
    })

    if (!response.ok || !response.body) {
      console.warn(
        `  WARNING: Failed to download image: ${imageUrl} (${response.status})`
      )
      return false
    }

    const fileStream = fs.createWriteStream(destPath)
    // @ts-expect-error ReadableStream to NodeJS stream
    await pipeline(Readable.fromWeb(response.body), fileStream)
    return true
  } catch (err) {
    console.warn(`  WARNING: Error downloading image: ${imageUrl}`, err)
    return false
  }
}

async function processImages(
  content: string,
  slug: string
): Promise<{ content: string; imagesDownloaded: number }> {
  let imagesDownloaded = 0
  let processed = content

  // Find all image references - both markdown ![...](...) and HTML <img src="...">
  const markdownImagePattern =
    /!\[([^\]]*)\]\((https?:\/\/(?:www\.)?philipithomas\.com\/[^)]+)\)/g
  const htmlImagePattern =
    /<img[^>]+src="(https?:\/\/(?:www\.)?philipithomas\.com\/[^"]+)"[^>]*>/g

  // Also match postcard.page images (from the hosted platform)
  const postcardImagePattern =
    /!\[([^\]]*)\]\((https?:\/\/a\.postcard\.page\/[^)]+)\)/g

  // Collect all philipithomas.com image URLs
  const imageUrls: { fullMatch: string; url: string; alt: string }[] = []

  let match: RegExpExecArray | null

  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
  while ((match = markdownImagePattern.exec(content)) !== null) {
    imageUrls.push({ fullMatch: match[0], url: match[2], alt: match[1] })
  }

  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
  while ((match = htmlImagePattern.exec(content)) !== null) {
    imageUrls.push({ fullMatch: match[0], url: match[1], alt: '' })
  }

  // Download postcard.page images too
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
  while ((match = postcardImagePattern.exec(content)) !== null) {
    imageUrls.push({ fullMatch: match[0], url: match[2], alt: match[1] })
  }

  for (const img of imageUrls) {
    // Determine filename from URL
    let filename: string
    try {
      const urlObj = new URL(img.url)
      const pathParts = urlObj.pathname.split('/')
      filename = pathParts[pathParts.length - 1] || 'image.jpg'
      // Clean query params from filename
      filename = filename.split('?')[0]
      // If filename has no extension, add .jpg
      if (!path.extname(filename)) {
        filename = `${filename}.jpg`
      }
    } catch {
      filename = 'image.jpg'
    }

    const destPath = path.join(POSTS_IMAGES_DIR, slug, filename)
    const localPath = `/images/posts/${slug}/${filename}`

    console.log(`  Downloading image: ${img.url.substring(0, 80)}...`)
    const success = await downloadImage(img.url, destPath)

    if (success) {
      imagesDownloaded++
      // Replace the URL in the content
      processed = processed.replace(
        img.fullMatch,
        img.fullMatch.includes('<img')
          ? `<img src="${localPath}" alt="${img.alt}" />`
          : `![${img.alt}](${localPath})`
      )
    }
  }

  return { content: processed, imagesDownloaded }
}

async function fetchPost(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; migration-script)',
        Accept: 'text/markdown, text/plain, */*',
      },
    })

    if (!response.ok) {
      console.warn(`  WARNING: Failed to fetch ${url} (${response.status})`)
      return null
    }

    return await response.text()
  } catch (err) {
    console.warn(`  WARNING: Error fetching ${url}`, err)
    return null
  }
}

async function processBatch(
  posts: PostDefinition[],
  batchNum: number,
  totalBatches: number
): Promise<{ success: number; images: number }> {
  let successCount = 0
  let imagesTotal = 0

  for (const post of posts) {
    console.log(
      `\n[Batch ${batchNum}/${totalBatches}] Fetching: ${post.slug} (${post.type})`
    )

    const raw = await fetchPost(post.url)
    if (!raw) {
      console.warn(`  SKIPPED: Could not fetch ${post.url}`)
      continue
    }

    const {
      title: rawTitle,
      publishedAt,
      content: rawContent,
    } = parsePostContent(raw)

    // Determine title
    let title: string
    if (post.type === 'postcard') {
      title = getPostcardTitle(post.slug)
    } else {
      // Use the parsed title, removing any emojis
      title = rawTitle
        .replace(/[\u{1F600}-\u{1F9FF}]/gu, '')
        .replace(/[\u{2600}-\u{26FF}]/gu, '')
        .replace(/[\u{2700}-\u{27BF}]/gu, '')
        .trim()
    }

    // Determine date
    let dateStr: string
    if (post.type === 'postcard') {
      dateStr = getPostcardDate(post.slug)
    } else if (publishedAt) {
      dateStr = publishedAt
    } else {
      console.warn(`  WARNING: No date found for ${post.slug}, using fallback`)
      dateStr = '2022-01-01'
    }

    // Process images
    const { content: contentWithImages, imagesDownloaded } =
      await processImages(rawContent, post.slug)
    imagesTotal += imagesDownloaded

    // Escape curly braces for MDX
    const escapedContent = escapeCurlyBracesOutsideCodeBlocks(contentWithImages)

    // Clean up &nbsp; entities
    const cleanContent = escapedContent
      .replace(/&nbsp;/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim()

    // Build frontmatter
    const frontmatter = [
      '---',
      `title: "${escapeTitle(title)}"`,
      `publishedAt: "${dateStr}"`,
      '---',
    ].join('\n')

    const mdxContent = `${frontmatter}\n\n${cleanContent}\n`

    // Determine output path
    const newsletter = post.type
    const filename = `${dateStr}-${post.slug}.mdx`
    const outputDir = path.join(CONTENT_DIR, newsletter)
    const outputPath = path.join(outputDir, filename)

    // Ensure directory exists
    fs.mkdirSync(outputDir, { recursive: true })

    // Write file
    fs.writeFileSync(outputPath, mdxContent, 'utf-8')
    console.log(`  Created: ${newsletter}/${filename}`)
    successCount++

    // Small delay between requests to be polite
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  return { success: successCount, images: imagesTotal }
}

async function main() {
  console.log(`Migrating ${allPosts.length} posts from philipithomas.com\n`)
  console.log(`  Postcard posts: ${postcardPosts.length}`)
  console.log(`  Contraption posts: ${contraptionPosts.length}`)

  // Ensure output directories exist
  fs.mkdirSync(path.join(CONTENT_DIR, 'postcard'), { recursive: true })
  fs.mkdirSync(path.join(CONTENT_DIR, 'contraption'), { recursive: true })
  fs.mkdirSync(POSTS_IMAGES_DIR, { recursive: true })

  // Process in batches of 5
  const BATCH_SIZE = 5
  let totalSuccess = 0
  let totalImages = 0

  for (let i = 0; i < allPosts.length; i += BATCH_SIZE) {
    const batch = allPosts.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(allPosts.length / BATCH_SIZE)

    const result = await processBatch(batch, batchNum, totalBatches)
    totalSuccess += result.success
    totalImages += result.images

    // Delay between batches
    if (i + BATCH_SIZE < allPosts.length) {
      console.log('\n  Waiting between batches...')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  console.log('\n=== Migration Complete ===')
  console.log(`Posts migrated: ${totalSuccess} / ${allPosts.length}`)
  console.log(`Images downloaded: ${totalImages}`)

  // Count results
  const postcardFiles = fs.existsSync(path.join(CONTENT_DIR, 'postcard'))
    ? fs
        .readdirSync(path.join(CONTENT_DIR, 'postcard'))
        .filter((f) => f.endsWith('.mdx'))
    : []
  const contraptionFiles = fs
    .readdirSync(path.join(CONTENT_DIR, 'contraption'))
    .filter((f) => f.endsWith('.mdx'))

  console.log(`\nPostcard files: ${postcardFiles.length}`)
  console.log(`Contraption files: ${contraptionFiles.length}`)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
