import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { siteConfig } from '@/lib/config'
import { getAllPosts } from '@/lib/content/loader'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { renderFullNewsletter } from '@/lib/email/send'
import { buildCorpusFromPosts } from '@/lib/search/corpus'
import { EMBEDDING_DIMS, EMBEDDING_MODEL } from '@/lib/search/embedding'
import { loadSearchIndex } from '@/lib/search/index-file'
import { buildMerkleTree, diffMerkleTrees } from '@/lib/search/merkle'

/**
 * Fast, offline validation that the content pipeline's generated artifacts are
 * in sync with the posts — the things that silently degrade when a manual step
 * is forgotten. Runs in pre-commit, CI, and the Vercel build (it needs only the
 * repo, no network or API keys), and fails loudly with the command to run.
 *
 *   1. Cover images referenced by frontmatter exist on disk.
 *   2. Every cover has a 1200×630 Open Graph variant within budget
 *      (pnpm images:generate).
 *   3. Web/email image sources stay within Vercel Image Optimization's source
 *      dimension limit.
 *   4. The committed search index matches the recomputed merkle tree over the
 *      post corpus, and related-posts.json covers every post (pnpm search:index).
 *   5. In-article images stay within Vercel Image Optimization's source
 *      dimension limit.
 *   6. Every body image (markdown `![](src)` and MDX `<img>`/`<Image>`) ships
 *      with non-empty alt text — a missing or empty alt fails the build.
 *   7. The rendered email HTML for every post stays under Gmail's clipping
 *      threshold (warn near the line, fail over it).
 */

const IMAGES = path.join(process.cwd(), 'public/images')
const OG_COVERS = path.join(IMAGES, 'og/covers')
const RELATED_JSON = path.join(
  process.cwd(),
  'src/generated/related-posts.json'
)

// Vercel Image Optimization rejects source images above this edge limit.
const MAX_VERCEL_SOURCE_EDGE = 8192
const OG_COVER_WIDTH = 1200
const OG_COVER_HEIGHT = 630
const MAX_OG_COVER_BYTES = 1024 * 1024
// Gmail clips messages near 102KB of HTML; warn close to the line, fail over it.
const MAX_EMAIL_HTML_BYTES = 100 * 1024
const WARN_EMAIL_HTML_BYTES = 95 * 1024
const EMAIL_HTML_BUDGET_EXEMPT_SLUGS = new Set([
  // Old archive post, not sent as a newsletter from this site.
  'rethinking-work-beyond-the-factory',
])

const errors: string[] = []
const warnings: string[] = []

async function checkOgCoverVariant(basename: string, slug: string) {
  const ogBasename = `${path.parse(basename).name}.jpg`
  const variant = path.join(OG_COVERS, ogBasename)
  if (!fs.existsSync(variant)) {
    errors.push(
      `${slug}: missing Open Graph cover ${path.relative(process.cwd(), variant)} — run \`pnpm images:generate\``
    )
    return
  }

  const meta = await sharp(variant).metadata()
  if (meta.width !== OG_COVER_WIDTH || meta.height !== OG_COVER_HEIGHT) {
    errors.push(
      `${slug}: Open Graph cover ${ogBasename} is ${meta.width}x${meta.height}, expected ${OG_COVER_WIDTH}x${OG_COVER_HEIGHT} — run \`pnpm images:generate\``
    )
  }

  const size = fs.statSync(variant).size
  if (size > MAX_OG_COVER_BYTES) {
    errors.push(
      `${slug}: Open Graph cover ${ogBasename} is ${(size / 1024).toFixed(0)}KB (budget ${MAX_OG_COVER_BYTES / 1024}KB) — run \`pnpm images:generate\``
    )
  }
}

async function checkVercelSourceImage(filePath: string) {
  const meta = await sharp(filePath).metadata()
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (longest > MAX_VERCEL_SOURCE_EDGE) {
    errors.push(
      `${path.relative(process.cwd(), filePath)} is ${longest}px on its longest side (max ${MAX_VERCEL_SOURCE_EDGE} for Vercel Image Optimization)`
    )
  }
}

async function main() {
  const posts = getAllPosts()

  // 1 + 2: cover images and their generated Open Graph variants
  for (const post of posts) {
    const cover = post.frontmatter.coverImage
    if (!cover || cover.startsWith('http')) continue
    const source = path.join(process.cwd(), 'public', cover)
    if (!fs.existsSync(source)) {
      errors.push(`${post.slug}: coverImage ${cover} does not exist on disk`)
      continue
    }
    const basename = path.basename(cover)
    await checkVercelSourceImage(source)
    await checkOgCoverVariant(basename, post.slug)
  }

  // 3: hero sources must be valid Vercel Image Optimization inputs
  const sources = ['portrait.jpg', 'philip-horizontal.jpg']
    .map((name) => path.join(IMAGES, name))
    .filter((p) => fs.existsSync(p))
  for (const src of sources) {
    await checkVercelSourceImage(src)
  }

  // 5: in-article image sources must be valid Vercel Image Optimization inputs.
  const postsDir = path.join(IMAGES, 'posts')
  if (fs.existsSync(postsDir)) {
    const stack = [postsDir]
    while (stack.length > 0) {
      const dir = stack.pop() as string
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          stack.push(full)
          continue
        }
        if (!/\.(jpe?g|png)$/i.test(entry.name)) continue
        await checkVercelSourceImage(full)
      }
    }
  }

  // 4a: the committed search index matches the recomputed merkle tree
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
  } else {
    const tree = buildMerkleTree(
      buildCorpusFromPosts(posts),
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
        })),
      })
      const stale =
        diff.stale.length > 0 ? diff.stale.join(', ') : '(root only)'
      errors.push(
        `search-index.json is stale for: ${stale} — run \`pnpm search:index\``
      )
    }
  }

  // 4b: related-posts coverage (regenerated by the same command)
  if (!fs.existsSync(RELATED_JSON)) {
    errors.push(
      'src/generated/related-posts.json is missing — run `pnpm search:index`'
    )
  } else {
    const related: { posts: Record<string, unknown> } = JSON.parse(
      fs.readFileSync(RELATED_JSON, 'utf-8')
    )
    for (const post of posts) {
      if (!(post.slug in related.posts)) {
        errors.push(
          `${post.slug}: no related-posts entry — run \`pnpm search:index\``
        )
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
    `Content check passed: ${posts.length} posts, images + search index in sync`
  )
}

main().catch((err) => {
  console.error('Content check crashed:', err)
  process.exit(1)
})
