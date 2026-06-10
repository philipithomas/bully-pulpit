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
 *   2. Every cover has email variants within size budget (pnpm images:optimize).
 *   3. No source image is wider than the web maximum (pnpm images:optimize).
 *   4. The committed search index matches the recomputed merkle tree over the
 *      post corpus, and related-posts.json covers every post (pnpm search:index).
 *   5. In-article images are within the long-edge cap and have an email
 *      variant within budget (pnpm images:optimize).
 *   6. Every body image (markdown `![](src)` and MDX `<img>`/`<Image>`) ships
 *      with non-empty alt text — a missing or empty alt fails the build.
 *   7. The rendered email HTML for every post stays under Gmail's clipping
 *      threshold (warn near the line, fail over it).
 */

const IMAGES = path.join(process.cwd(), 'public/images')
const EMAIL_COVERS = path.join(IMAGES, 'email/covers')
const EMAIL_THUMBS = path.join(IMAGES, 'email/thumbnails')
const RELATED_JSON = path.join(
  process.cwd(),
  'src/generated/related-posts.json'
)

// Budgets mirror scripts/optimize-images.ts output and the render-html tests.
const MAX_WEB_WIDTH = 2560
const MAX_EMAIL_COVER_BYTES = 110 * 1024
const MAX_EMAIL_THUMB_BYTES = 15 * 1024
// In-article images: web sources are capped on the long edge (also keeps them
// far under the 8192px Vercel image optimizer source limit), and the email
// variants share the cover budget (both are 600px wide JPEGs).
const MAX_POST_LONG_EDGE = 1600
const MAX_EMAIL_POST_BYTES = MAX_EMAIL_COVER_BYTES
// Gmail clips messages near 102KB of HTML; warn close to the line, fail over it.
const MAX_EMAIL_HTML_BYTES = 100 * 1024
const WARN_EMAIL_HTML_BYTES = 95 * 1024

const errors: string[] = []
const warnings: string[] = []

function checkEmailVariant(
  dir: string,
  basename: string,
  budget: number,
  kind: string,
  slug: string
) {
  const variant = path.join(dir, basename)
  if (!fs.existsSync(variant)) {
    errors.push(
      `${slug}: missing email ${kind} ${path.relative(process.cwd(), variant)} — run \`pnpm images:optimize\``
    )
    return
  }
  const size = fs.statSync(variant).size
  if (size > budget) {
    errors.push(
      `${slug}: email ${kind} ${basename} is ${(size / 1024).toFixed(0)}KB (budget ${budget / 1024}KB) — run \`pnpm images:optimize\``
    )
  }
}

async function main() {
  const posts = getAllPosts()

  // 1 + 2: cover images and their email variants
  for (const post of posts) {
    const cover = post.frontmatter.coverImage
    if (!cover || cover.startsWith('http')) continue
    const source = path.join(process.cwd(), 'public', cover)
    if (!fs.existsSync(source)) {
      errors.push(`${post.slug}: coverImage ${cover} does not exist on disk`)
      continue
    }
    const basename = path.basename(cover)
    checkEmailVariant(
      EMAIL_COVERS,
      basename,
      MAX_EMAIL_COVER_BYTES,
      'cover',
      post.slug
    )
    checkEmailVariant(
      EMAIL_THUMBS,
      basename,
      MAX_EMAIL_THUMB_BYTES,
      'thumbnail',
      post.slug
    )
  }

  // 3: unresized source images (covers + heroes, same set images:optimize handles)
  const sources = ['portrait.jpg', 'philip-horizontal.jpg']
    .map((name) => path.join(IMAGES, name))
    .filter((p) => fs.existsSync(p))
  const coversDir = path.join(IMAGES, 'covers')
  if (fs.existsSync(coversDir)) {
    for (const file of fs.readdirSync(coversDir)) {
      if (/\.(jpe?g|png)$/i.test(file)) sources.push(path.join(coversDir, file))
    }
  }
  for (const src of sources) {
    const meta = await sharp(src).metadata()
    if ((meta.width ?? 0) > MAX_WEB_WIDTH) {
      errors.push(
        `${path.relative(process.cwd(), src)} is ${meta.width}px wide (max ${MAX_WEB_WIDTH}) — run \`pnpm images:optimize\``
      )
    }
  }

  // 5: in-article images go through the same pipeline as covers — the web
  // source is capped at MAX_POST_LONG_EDGE and a 600px email variant exists
  // under email/posts/ within budget. Emails reference those variants, so a
  // missing or oversized one ships a degraded newsletter with no local signal.
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
        const meta = await sharp(full).metadata()
        const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
        if (longest > MAX_POST_LONG_EDGE) {
          errors.push(
            `${path.relative(process.cwd(), full)} is ${longest}px on its longest side (max ${MAX_POST_LONG_EDGE}) — run \`pnpm images:optimize\``
          )
        }
        const rel = path.relative(IMAGES, full)
        const variant = path.join(IMAGES, 'email', rel)
        if (!fs.existsSync(variant)) {
          errors.push(
            `${rel}: missing email variant ${path.relative(process.cwd(), variant)} — run \`pnpm images:optimize\``
          )
          continue
        }
        const size = fs.statSync(variant).size
        if (size > MAX_EMAIL_POST_BYTES) {
          errors.push(
            `${rel}: email variant is ${(size / 1024).toFixed(0)}KB (budget ${MAX_EMAIL_POST_BYTES / 1024}KB) — run \`pnpm images:optimize\``
          )
        }
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
