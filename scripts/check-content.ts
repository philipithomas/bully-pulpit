import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { getAllPosts } from '@/lib/content/loader'

/**
 * Fast, offline validation that the content pipeline's generated artifacts are
 * in sync with the posts — the things that silently degrade when a manual step
 * is forgotten. Runs in pre-commit, CI, and the Vercel build (it needs only the
 * repo, no network or API keys), and fails loudly with the command to run.
 *
 *   1. Cover images referenced by frontmatter exist on disk.
 *   2. Every cover has email variants within size budget (pnpm images:optimize).
 *   3. No source image is wider than the web maximum (pnpm images:optimize).
 *   4. Every post has a related-posts entry, which transitively proves a
 *      summary was generated (pnpm summaries:generate && pnpm chroma:related).
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
// Vercel image optimization rejects sources larger than 8192px per side.
const MAX_OPTIMIZER_SOURCE_PX = 8192

const errors: string[] = []

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

  // 5: in-article images must stay within the Vercel image optimizer source
  // limit (8192px per side) — they render through next/image, and an
  // over-limit source fails to optimize in production with no local signal.
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
        if (longest > MAX_OPTIMIZER_SOURCE_PX) {
          errors.push(
            `${path.relative(process.cwd(), full)} is ${longest}px on its longest side (Vercel optimizer limit ${MAX_OPTIMIZER_SOURCE_PX}) — resize the source`
          )
        }
      }
    }
  }

  // 4: related-posts coverage (proves summaries exist for every post)
  if (!fs.existsSync(RELATED_JSON)) {
    errors.push(
      'src/generated/related-posts.json is missing — run `pnpm summaries:generate && pnpm chroma:related`'
    )
  } else {
    const related: { posts: Record<string, unknown> } = JSON.parse(
      fs.readFileSync(RELATED_JSON, 'utf-8')
    )
    for (const post of posts) {
      if (!(post.slug in related.posts)) {
        errors.push(
          `${post.slug}: no related-posts entry (summary likely never generated) — run \`pnpm summaries:generate && pnpm chroma:related\``
        )
      }
    }
  }

  // Warning only: body images should ship with alt text. Decorative empties
  // are allowed, so this lists offenders without failing the build.
  const emptyAlt: string[] = []
  for (const post of posts) {
    for (const match of post.content.matchAll(/!\[\]\(([^)]+)\)/g)) {
      emptyAlt.push(`${post.slug}: image ${match[1]} has empty alt text`)
    }
  }
  if (emptyAlt.length > 0) {
    console.warn(`Content check warnings (${emptyAlt.length} empty alt(s)):`)
    for (const w of emptyAlt) console.warn(`  ! ${w}`)
  }

  if (errors.length > 0) {
    console.error(`Content check failed (${errors.length} problem(s)):\n`)
    for (const e of errors) console.error(`  ✗ ${e}`)
    console.error('')
    process.exit(1)
  }
  console.log(
    `Content check passed: ${posts.length} posts, images + summaries in sync`
  )
}

main().catch((err) => {
  console.error('Content check crashed:', err)
  process.exit(1)
})
