import fs from 'node:fs'
import path from 'node:path'
import TurndownService from 'turndown'

// Paths
const WORKING_DIR = path.resolve(__dirname, '../../')
const GHOST_JSON = path.join(WORKING_DIR, 'ghost-posts.json')
const GHOST_IMAGES_DIR = path.join(WORKING_DIR, 'ghost-backup/images')
const PROJECT_DIR = path.resolve(__dirname, '../')
const CONTENT_DIR = path.join(PROJECT_DIR, 'content')
const PUBLIC_DIR = path.join(PROJECT_DIR, 'public')
const COVERS_DIR = path.join(PUBLIC_DIR, 'images/covers')
const POSTS_IMAGES_DIR = path.join(PUBLIC_DIR, 'images/posts')

// Workshop tag ID from Ghost
const WORKSHOP_TAG_ID = '68d82d57484fb400012fbbaa'

interface GhostPost {
  id: string
  slug: string
  title: string
  html: string | null
  custom_excerpt: string | null
  feature_image: string | null
  published_at: string | null
  status: string
  type: string
}

interface GhostPostTag {
  post_id: string
  tag_id: string
}

interface GhostData {
  db: [
    {
      data: { posts: GhostPost[]; tags: unknown[]; posts_tags: GhostPostTag[] }
    },
  ]
}

function escapeTitle(title: string): string {
  // Escape double quotes in title for YAML frontmatter
  return title.replace(/"/g, '\\"')
}

function extractDateFromPublishedAt(publishedAt: string): string {
  // publishedAt is like "2025-05-16T15:00:53.000Z"
  return publishedAt.slice(0, 10)
}

function extractImagePath(ghostUrl: string): string | null {
  // __GHOST_URL__/content/images/YYYY/MM/filename.jpg -> YYYY/MM/filename.jpg
  const match = ghostUrl.match(/__GHOST_URL__\/content\/images\/(.+)/)
  if (match) return match[1]
  return null
}

function getFileExtension(filePath: string): string {
  const ext = path.extname(filePath)
  return ext || '.jpg'
}

function copyImage(
  srcRelative: string,
  destPath: string,
  label: string
): boolean {
  const srcPath = path.join(GHOST_IMAGES_DIR, srcRelative)
  if (!fs.existsSync(srcPath)) {
    console.warn(`  WARNING: ${label} image not found: ${srcPath}`)
    return false
  }

  const destDir = path.dirname(destPath)
  fs.mkdirSync(destDir, { recursive: true })
  fs.copyFileSync(srcPath, destPath)
  return true
}

function escapeCurlyBracesOutsideCodeBlocks(markdown: string): string {
  // Split on fenced code blocks (``` ... ```)
  const parts = markdown.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part, i) => {
      // Odd indices are code blocks - leave them alone
      if (i % 2 === 1) return part
      // Even indices are regular markdown - escape curly braces
      return part.replace(/\{/g, '\\{').replace(/\}/g, '\\}')
    })
    .join('')
}

function main() {
  console.log('Reading ghost-posts.json...')
  const raw = fs.readFileSync(GHOST_JSON, 'utf-8')
  const ghostData: GhostData = JSON.parse(raw)
  const data = ghostData.db[0].data

  // Build set of workshop post IDs
  const workshopPostIds = new Set(
    data.posts_tags
      .filter((pt) => pt.tag_id === WORKSHOP_TAG_ID)
      .map((pt) => pt.post_id)
  )

  // Filter to published posts only (not pages)
  const publishedPosts = data.posts.filter(
    (p) => p.status === 'published' && p.type === 'post'
  )

  console.log(`Found ${publishedPosts.length} published posts`)
  console.log(
    `Workshop: ${publishedPosts.filter((p) => workshopPostIds.has(p.id)).length}`
  )
  console.log(
    `Contraption: ${publishedPosts.filter((p) => !workshopPostIds.has(p.id)).length}`
  )

  // Ensure output directories exist
  fs.mkdirSync(path.join(CONTENT_DIR, 'contraption'), { recursive: true })
  fs.mkdirSync(path.join(CONTENT_DIR, 'workshop'), { recursive: true })
  fs.mkdirSync(COVERS_DIR, { recursive: true })
  fs.mkdirSync(POSTS_IMAGES_DIR, { recursive: true })

  // Set up turndown
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })

  // Collect all post slugs for cross-reference resolution
  const allSlugs = new Set(publishedPosts.map((p) => p.slug))

  let successCount = 0
  let imagesCopied = 0
  let imagesWarned = 0

  for (const post of publishedPosts) {
    const newsletter = workshopPostIds.has(post.id) ? 'workshop' : 'contraption'
    const dateStr = extractDateFromPublishedAt(post.published_at!)
    const filename = `${dateStr}-${post.slug}.mdx`
    const outputPath = path.join(CONTENT_DIR, newsletter, filename)

    console.log(`\nProcessing: ${post.slug} -> ${newsletter}/${filename}`)

    let html = post.html || ''

    // Handle feature image (cover)
    let coverImagePath: string | undefined
    if (post.feature_image) {
      const imgRelative = extractImagePath(post.feature_image)
      if (imgRelative) {
        const ext = getFileExtension(imgRelative)
        const coverFilename = `${post.slug}-cover${ext}`
        const destPath = path.join(COVERS_DIR, coverFilename)

        if (copyImage(imgRelative, destPath, 'Cover')) {
          coverImagePath = `/images/covers/${coverFilename}`
          imagesCopied++
          console.log(`  Cover image: ${coverImagePath}`)
        } else {
          imagesWarned++
        }
      } else if (
        post.feature_image.startsWith('http://') ||
        post.feature_image.startsWith('https://')
      ) {
        // External cover image - use as-is
        coverImagePath = post.feature_image
        console.log(`  External cover image: ${coverImagePath}`)
      }
    }

    // Handle in-post images: find all __GHOST_URL__/content/images/ references
    const ghostImagePattern = /__GHOST_URL__\/content\/images\/([^\s"'<>)]+)/g
    let match: RegExpExecArray | null
    const postImagesDir = path.join(POSTS_IMAGES_DIR, post.slug)

    // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
    while ((match = ghostImagePattern.exec(html)) !== null) {
      const imgRelative = match[1]
      const imgFilename = path.basename(imgRelative)
      const destPath = path.join(postImagesDir, imgFilename)

      if (copyImage(imgRelative, destPath, 'Post')) {
        imagesCopied++
      } else {
        imagesWarned++
      }
    }

    // Replace __GHOST_URL__/content/images/YYYY/MM/file with /images/posts/{slug}/file in HTML
    html = html.replace(
      /__GHOST_URL__\/content\/images\/[^\s"'<>)]+/g,
      (fullMatch) => {
        const filename = path.basename(fullMatch)
        return `/images/posts/${post.slug}/${filename}`
      }
    )

    // Replace __GHOST_URL__/content/files/... links - keep as-is but warn
    if (html.includes('__GHOST_URL__/content/files/')) {
      console.log(
        `  WARNING: Post contains file downloads that need manual review`
      )
    }

    // Replace __GHOST_URL__/{slug}/ cross-references with relative links
    html = html.replace(
      /__GHOST_URL__\/([^"'\s<>)#?]+)/g,
      (fullMatch, pathPart: string) => {
        // Skip content paths (images, files)
        if (pathPart.startsWith('content/')) return fullMatch
        // Clean up the path
        const cleanSlug = pathPart.replace(/\/$/, '').replace(/\?.*$/, '')
        if (cleanSlug === '') return '/'
        // Check if it's a known post slug
        if (allSlugs.has(cleanSlug)) {
          return `/${cleanSlug}`
        }
        // It might be a page or other path - just use the path
        return `/${cleanSlug}`
      }
    )

    // Handle remaining __GHOST_URL__ references (e.g., portal links)
    html = html.replace(/__GHOST_URL__\/#\/portal\/signup/g, '/subscribe')
    html = html.replace(
      /__GHOST_URL__\/#\/portal\/account\/newsletters/g,
      '/account'
    )
    html = html.replace(/__GHOST_URL__\/?/g, '/')

    // Convert HTML to markdown
    let markdown = turndown.turndown(html)

    // Escape curly braces for MDX (but not inside fenced code blocks)
    markdown = escapeCurlyBracesOutsideCodeBlocks(markdown)

    // Clean up any remaining artifacts
    markdown = markdown.trim()

    // Build frontmatter
    const frontmatterLines = ['---', `title: "${escapeTitle(post.title)}"`]

    if (post.custom_excerpt) {
      frontmatterLines.push(
        `description: "${escapeTitle(post.custom_excerpt)}"`
      )
    }

    frontmatterLines.push(`publishedAt: "${dateStr}"`)

    if (coverImagePath) {
      frontmatterLines.push(`coverImage: "${coverImagePath}"`)
    }

    frontmatterLines.push('---')

    const mdxContent = frontmatterLines.join('\n') + '\n\n' + markdown + '\n'

    // Write MDX file
    fs.writeFileSync(outputPath, mdxContent, 'utf-8')
    successCount++
  }

  console.log('\n=== Migration Complete ===')
  console.log(`Posts migrated: ${successCount}`)
  console.log(`Images copied: ${imagesCopied}`)
  console.log(`Image warnings: ${imagesWarned}`)

  // Count results
  const contraptionFiles = fs
    .readdirSync(path.join(CONTENT_DIR, 'contraption'))
    .filter((f) => f.endsWith('.mdx'))
  const workshopFiles = fs
    .readdirSync(path.join(CONTENT_DIR, 'workshop'))
    .filter((f) => f.endsWith('.mdx'))

  console.log(`\nContraption posts: ${contraptionFiles.length}`)
  console.log(`Workshop posts: ${workshopFiles.length}`)
}

main()
