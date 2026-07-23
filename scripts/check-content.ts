import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { siteConfig } from '@/lib/config'
import {
  formatImageBytes,
  isPolicyImagePath,
  MAX_PUBLIC_IMAGE_BYTES,
  MAX_PUBLIC_IMAGE_EDGE,
} from '@/lib/content/image-policy'
import { imageHasEmbeddedLocationMetadata } from '@/lib/content/image-privacy'
import { getAllPosts, getPages } from '@/lib/content/loader'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { renderFullNewsletter } from '@/lib/email/send'
import { isPhotoNewsletter } from '@/lib/newsletters'
import { buildCorpus } from '@/lib/search/corpus'
import { EMBEDDING_DIMS, EMBEDDING_MODEL } from '@/lib/search/embedding'
import { publicImageDigest } from '@/lib/search/image-source'
import { loadSearchIndex, SEARCH_INDEX_VERSION } from '@/lib/search/index-file'
import { buildMerkleTree, diffMerkleTrees } from '@/lib/search/merkle'

/**
 * Fast, offline validation that the content pipeline's generated artifacts are
 * in sync with posts and pages — the things that silently degrade when a manual
 * step is forgotten. Runs in pre-commit, CI, and the Vercel build (it needs
 * only the repo, no network or API keys), and fails loudly with the command to
 * run.
 *
 *   1. Cover images referenced by frontmatter exist on disk.
 *   2. Photo-newsletter cover images contain no embedded GPS/location
 *      metadata, including draft and orphaned files in their cover folders.
 *   3. Public web images fit the local deployment policy: web-sized sources
 *      only, no camera originals or LFS pointers in the Vercel artifact.
 *   4. The committed search index matches the recomputed merkle tree over the
 *      searchable corpus, and related-posts.json covers every post without
 *      recommending photo posts from non-photo posts (pnpm search:index).
 *   5. In-article image sources are covered by the same public image policy.
 *   6. Every body image (markdown `![](src)` and MDX `<img>`/`<Image>`) ships
 *      with non-empty alt text — a missing or empty alt fails the build.
 *   7. The rendered email HTML for every non-exempt post stays under Gmail's
 *      clipping threshold (warn near the line, fail over it).
 */

const IMAGES = path.join(process.cwd(), 'public/images')
const COVERS = path.join(IMAGES, 'covers')
const PHOTO_COVER_DIRS = [
  path.join(COVERS, 'tidbits'),
  path.join(COVERS, 'tsundoku'),
]
const RELATED_JSON = path.join(
  process.cwd(),
  'src/generated/related-posts.json'
)

// Gmail clips messages near 102KB of HTML; warn close to the line, fail over it.
const MAX_EMAIL_HTML_BYTES = 100 * 1024
const WARN_EMAIL_HTML_BYTES = 95 * 1024
const EMAIL_HTML_BUDGET_EXEMPT_SLUGS = new Set([
  // Old archive post, not sent as a newsletter from this site.
  'rethinking-work-beyond-the-factory',
])

const errors: string[] = []
const warnings: string[] = []

async function checkPublicImagePolicy(filePath: string) {
  const relative = path.relative(process.cwd(), filePath)
  const bytes = fs.statSync(filePath).size
  if (bytes > MAX_PUBLIC_IMAGE_BYTES) {
    errors.push(
      `${relative} is ${formatImageBytes(bytes)} (max ${formatImageBytes(MAX_PUBLIC_IMAGE_BYTES)} for deployable public images) — run \`pnpm images:optimize ${relative}\``
    )
  }

  try {
    const meta = await sharp(filePath).metadata()
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
    if (longest > MAX_PUBLIC_IMAGE_EDGE) {
      errors.push(
        `${relative} is ${longest}px on its longest side (max ${MAX_PUBLIC_IMAGE_EDGE} for deployable public images) — run \`pnpm images:optimize ${relative}\``
      )
    }
  } catch {
    errors.push(
      `${relative} could not be read as an image — make sure it is a real optimized image file, not a Git LFS pointer`
    )
  }
}

async function checkPublicCoverPrivacy(filePath: string) {
  const relative = path.relative(process.cwd(), filePath)
  try {
    if (await imageHasEmbeddedLocationMetadata(filePath)) {
      errors.push(
        `${relative} contains embedded GPS/location metadata — export with Strip GPS Location before publishing`
      )
    }
  } catch {
    errors.push(
      `${relative} could not be checked for embedded GPS/location metadata`
    )
  }
}

async function main() {
  const posts = getAllPosts()
  const pages = getPages()
  const referencedPhotoCovers = new Set<string>()

  // 1: cover images referenced by frontmatter must exist
  for (const post of posts) {
    const cover = post.frontmatter.coverImage
    if (!cover || cover.startsWith('http')) continue
    const source = path.join(process.cwd(), 'public', cover)
    if (!fs.existsSync(source)) {
      errors.push(`${post.slug}: coverImage ${cover} does not exist on disk`)
    } else if (isPhotoNewsletter(post.newsletter)) {
      referencedPhotoCovers.add(source)
    }
  }

  // 2 + 3: every photo-newsletter cover must be free of embedded location
  // metadata, and every deployable public raster image must fit the web image
  // policy. Scanning the newsletter directories catches draft and orphaned
  // covers too; the explicit set also catches legacy/shared cover locations.
  if (fs.existsSync(IMAGES)) {
    const stack = [IMAGES]
    while (stack.length > 0) {
      const dir = stack.pop() as string
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          stack.push(full)
          continue
        }
        if (!entry.isFile() || !isPolicyImagePath(full)) continue
        const isPhotoCover =
          referencedPhotoCovers.has(full) ||
          PHOTO_COVER_DIRS.some((dir) => full.startsWith(`${dir}${path.sep}`))
        if (isPhotoCover) {
          await checkPublicCoverPrivacy(full)
        }
        await checkPublicImagePolicy(full)
      }
    }
  }

  // 3a: the committed search index matches the recomputed merkle tree
  // (offline — recomputes chunk hashes from content/, no embedding calls)
  const index = loadSearchIndex()
  if (!index) {
    errors.push(
      'src/generated/search-index.json is missing — run `pnpm search:index`'
    )
  } else if (index.model !== EMBEDDING_MODEL || index.dims !== EMBEDDING_DIMS) {
    errors.push(
      `search-index.json was built with ${index.model} (${index.dims} dims), expected ${EMBEDDING_MODEL} (${EMBEDDING_DIMS} dims) — run \`pnpm search:index\``
    )
  } else if (index.version !== SEARCH_INDEX_VERSION) {
    errors.push(
      `search-index.json is version ${index.version}, expected ${SEARCH_INDEX_VERSION} — run \`pnpm search:index\``
    )
  } else {
    const tree = buildMerkleTree(
      buildCorpus({ imageDigest: publicImageDigest }),
      EMBEDDING_MODEL,
      EMBEDDING_DIMS
    )
    if (tree.root !== index.merkleRoot) {
      const diff = diffMerkleTrees(tree, {
        root: index.merkleRoot,
        posts: index.posts.map((p) => ({
          slug: p.slug,
          hash: p.hash,
          chunks: p.chunks.map((c) => ({ seq: c.seq, hash: c.hash })),
          images: p.images.map((i) => ({ id: i.id, hash: i.hash })),
        })),
      })
      const stale =
        diff.stale.length > 0 ? diff.stale.join(', ') : '(root only)'
      errors.push(
        `search-index.json is stale for: ${stale} — run \`pnpm search:index\``
      )
    }
  }

  // 3b: related-posts coverage and newsletter-boundary policy (regenerated by
  // the same command). The search-index merkle tree does not commit to
  // newsletter classification, so enforce this invariant directly too.
  if (!fs.existsSync(RELATED_JSON)) {
    errors.push(
      'src/generated/related-posts.json is missing — run `pnpm search:index`'
    )
  } else {
    const related: {
      posts: Record<string, { related: { slug: string }[] }>
    } = JSON.parse(fs.readFileSync(RELATED_JSON, 'utf-8'))
    const postsBySlug = new Map(posts.map((post) => [post.slug, post]))
    for (const post of posts) {
      const entry = related.posts[post.slug]
      if (!entry) {
        errors.push(
          `${post.slug}: no related-posts entry — run \`pnpm search:index\``
        )
        continue
      }
      if (isPhotoNewsletter(post.newsletter)) continue

      for (const candidate of entry.related) {
        const relatedPost = postsBySlug.get(candidate.slug)
        if (relatedPost && isPhotoNewsletter(relatedPost.newsletter)) {
          errors.push(
            `${post.slug}: related-posts includes photo post ${candidate.slug} for a non-photo post — run \`pnpm search:index\``
          )
        }
      }
    }
  }

  // 6: every body image ships with non-empty alt text. Covers markdown
  // `![alt](src)` and MDX `<img>`/`<Image>` (alt missing or empty/whitespace).
  // Hard failure: no image ships without alt text — decorative ones still get
  // a minimal honest alt rather than an empty slot.
  for (const post of posts) {
    // Markdown image syntax with an empty or whitespace-only alt.
    for (const match of post.content.matchAll(/!\[(\s*)\]\(([^)]+)\)/g)) {
      errors.push(
        `${post.slug}: image ${match[2]} has empty alt text — add descriptive alt text`
      )
    }
    // MDX <img>/<Image> elements: flag a missing alt attribute or one whose
    // value is empty/whitespace (covers "", '', {''}, {""}, {``}).
    for (const tag of post.content.matchAll(/<(img|Image)\b[^>]*?\/?>/gi)) {
      const altMatch = tag[0].match(
        /\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/i
      )
      const altValue = altMatch
        ? (altMatch[1] ??
          altMatch[2] ??
          altMatch[3] ??
          altMatch[4] ??
          altMatch[5] ??
          '')
        : null
      if (altValue === null) {
        errors.push(
          `${post.slug}: <${tag[1]}> ${tag[0].slice(0, 80)} is missing an alt attribute — add descriptive alt text`
        )
      } else if (altValue.trim() === '') {
        errors.push(
          `${post.slug}: <${tag[1]}> ${tag[0].slice(0, 80)} has empty alt text — add descriptive alt text`
        )
      }
    }
  }

  // 7: rendered newsletter size. Renders each post's full email offline
  // (body + transforms + shell, no network) with a representative
  // per-recipient unsubscribe URL, and holds it under Gmail's clipping
  // threshold (~102KB of HTML). A clipped email hides the footer, including
  // the unsubscribe link.
  const unsubscribeUrl = `${siteConfig.url}/unsubscribe?token=00000000-0000-0000-0000-000000000000`
  for (const post of posts) {
    if (EMAIL_HTML_BUDGET_EXEMPT_SLUGS.has(post.slug)) continue

    const body = await buildEmailBodyHtml(post)
    const html = renderFullNewsletter({
      bodyHtml: body.html,
      newsletter: post.newsletter,
      previewText: body.previewText,
      unsubscribeUrl,
    })
    const bytes = Buffer.byteLength(html, 'utf8')
    if (bytes > MAX_EMAIL_HTML_BYTES) {
      errors.push(
        `${post.slug}: rendered email HTML is ${(bytes / 1024).toFixed(0)}KB (budget ${MAX_EMAIL_HTML_BYTES / 1024}KB; Gmail clips near 102KB) — shorten the post`
      )
    } else if (bytes > WARN_EMAIL_HTML_BYTES) {
      warnings.push(
        `${post.slug}: rendered email HTML is ${(bytes / 1024).toFixed(0)}KB, near the ${MAX_EMAIL_HTML_BYTES / 1024}KB budget (Gmail clips near 102KB)`
      )
    }
  }

  if (warnings.length > 0) {
    console.warn(`Content check warnings (${warnings.length}):`)
    for (const w of warnings) console.warn(`  ! ${w}`)
  }

  if (errors.length > 0) {
    console.error(`Content check failed (${errors.length} problem(s)):\n`)
    for (const e of errors) console.error(`  ✗ ${e}`)
    console.error('')
    process.exit(1)
  }
  console.log(
    `Content check passed: ${posts.length} posts, ${pages.length} pages, images + search index in sync`
  )
}

main().catch((err) => {
  console.error('Content check crashed:', err)
  process.exit(1)
})
