import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC = path.resolve(__dirname, '../public')
const IMAGES = path.join(PUBLIC, 'images')
const FULL_DIR = path.join(IMAGES, 'full')
const POSTS_DIR = path.join(IMAGES, 'posts')
const EMAIL_DIR = path.join(IMAGES, 'email')
const EMAIL_COVERS_DIR = path.join(EMAIL_DIR, 'covers')
const EMAIL_THUMBS_DIR = path.join(EMAIL_DIR, 'thumbnails')

const MAX_WEB_WIDTH = 2560
// In-article images render in a 672px prose column, so 1600px on the long
// edge covers retina without shipping raw camera files.
const MAX_POST_LONG_EDGE = 1600
const EMAIL_COVER_WIDTH = 600
const EMAIL_THUMB_WIDTH = 200
const JPEG_QUALITY = 85
const FULL_QUALITY = 85
const EMAIL_QUALITY = 80
// Same byte budget scripts/check-content.ts enforces on email variants.
// Portrait images carry more pixels at 600px wide than landscape covers, so
// the encoder steps quality down until the variant fits.
const EMAIL_POST_BUDGET_BYTES = 110 * 1024
const EMAIL_MIN_QUALITY = 60

interface ImageEntry {
  src: string // absolute path to source
  rel: string // relative path from images/ (e.g. "covers/foo.jpg" or "portrait.jpg")
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function collectImages(): ImageEntry[] {
  const entries: ImageEntry[] = []

  // Hero images
  for (const name of ['portrait.jpg', 'philip-horizontal.jpg']) {
    const src = path.join(IMAGES, name)
    if (fs.existsSync(src)) {
      entries.push({ src, rel: name })
    }
  }

  // Cover images
  const coversDir = path.join(IMAGES, 'covers')
  if (fs.existsSync(coversDir)) {
    for (const file of fs.readdirSync(coversDir)) {
      if (/\.(jpe?g|png)$/i.test(file)) {
        entries.push({
          src: path.join(coversDir, file),
          rel: path.join('covers', file),
        })
      }
    }
  }

  return entries
}

// In-article images, nested under posts/<slug>/. rel keeps the full relative
// path (e.g. "posts/october-2023/IMG_9933.JPG") because basenames collide
// across posts.
function collectPostImages(): ImageEntry[] {
  const entries: ImageEntry[] = []
  if (!fs.existsSync(POSTS_DIR)) return entries
  const stack = [POSTS_DIR]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      const src = path.join(dir, dirent.name)
      if (dirent.isDirectory()) {
        stack.push(src)
        continue
      }
      if (/\.(jpe?g|png)$/i.test(dirent.name)) {
        entries.push({ src, rel: path.relative(IMAGES, src) })
      }
    }
  }
  return entries
}

async function optimizeImage(entry: ImageEntry) {
  const meta = await sharp(entry.src).metadata()
  const width = meta.width ?? 0
  const sizeBefore = fs.statSync(entry.src).size

  // 1. If oversized, preserve original in full/ and resize in place
  if (width > MAX_WEB_WIDTH) {
    const fullDest = path.join(FULL_DIR, entry.rel)
    ensureDir(path.dirname(fullDest))

    if (!fs.existsSync(fullDest)) {
      // Recompress at full resolution (keeps dimensions, reduces raw camera JPEG bloat)
      await sharp(entry.src).jpeg({ quality: FULL_QUALITY }).toFile(fullDest)
      const fullSize = fs.statSync(fullDest).size
      console.log(
        `  Preserved full-res -> images/full/${entry.rel} (${fmt(fullSize)})`
      )
    }

    await sharp(entry.src)
      .resize(MAX_WEB_WIDTH, undefined, { withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toFile(`${entry.src}.tmp`)

    fs.renameSync(`${entry.src}.tmp`, entry.src)
    const sizeAfter = fs.statSync(entry.src).size
    const saved = ((1 - sizeAfter / sizeBefore) * 100).toFixed(0)
    console.log(
      `  Resized ${entry.rel}: ${fmt(sizeBefore)} -> ${fmt(sizeAfter)} (${saved}% smaller)`
    )
  } else {
    console.log(
      `  ${entry.rel}: ${fmt(sizeBefore)} (${width}px, already <= ${MAX_WEB_WIDTH}px)`
    )
  }

  // 2. Generate email cover variant (600px wide)
  const emailCoverDest = path.join(EMAIL_COVERS_DIR, path.basename(entry.rel))
  ensureDir(EMAIL_COVERS_DIR)

  await sharp(entry.src)
    .resize(EMAIL_COVER_WIDTH, undefined, { withoutEnlargement: true })
    .jpeg({ quality: EMAIL_QUALITY })
    .toFile(emailCoverDest)

  const emailSize = fs.statSync(emailCoverDest).size
  console.log(
    `  Email cover -> images/email/covers/${path.basename(entry.rel)} (${fmt(emailSize)})`
  )

  // 3. Generate email thumbnail (200px wide)
  const emailThumbDest = path.join(EMAIL_THUMBS_DIR, path.basename(entry.rel))
  ensureDir(EMAIL_THUMBS_DIR)

  await sharp(entry.src)
    .resize(EMAIL_THUMB_WIDTH, undefined, { withoutEnlargement: true })
    .jpeg({ quality: EMAIL_QUALITY })
    .toFile(emailThumbDest)

  const thumbSize = fs.statSync(emailThumbDest).size
  console.log(
    `  Email thumb -> images/email/thumbnails/${path.basename(entry.rel)} (${fmt(thumbSize)})`
  )
}

// Mirrors optimizeImage for in-article images: cap the web source at
// MAX_POST_LONG_EDGE (preserving the original under full/ for the zoom
// overlay) and generate a 600px email variant under email/posts/. Differences
// from covers: the long edge is capped instead of the width (many photos are
// portrait), PNG screenshots stay lossless PNG on the web so text does not
// pick up JPEG artifacts, and .rotate() bakes in EXIF orientation (raw camera
// files carry it; re-encoding without it would render them sideways).
async function optimizePostImage(entry: ImageEntry) {
  const meta = await sharp(entry.src).metadata()
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0)
  const sizeBefore = fs.statSync(entry.src).size
  const isPng = /\.png$/i.test(entry.src)
  // Keep palette PNGs palette-encoded; truecolor re-encoding can double them.
  const pngOptions = { compressionLevel: 9, palette: meta.isPalette === true }

  // 1. If oversized, preserve original in full/ and resize in place
  if (longEdge > MAX_POST_LONG_EDGE) {
    const fullDest = path.join(FULL_DIR, entry.rel)
    ensureDir(path.dirname(fullDest))

    if (!fs.existsSync(fullDest)) {
      const full = sharp(entry.src).rotate()
      await (isPng
        ? full.png(pngOptions)
        : full.jpeg({ quality: FULL_QUALITY })
      ).toFile(fullDest)
      const fullSize = fs.statSync(fullDest).size
      console.log(
        `  Preserved full-res -> images/full/${entry.rel} (${fmt(fullSize)})`
      )
    }

    const resized = sharp(entry.src)
      .rotate()
      .resize(MAX_POST_LONG_EDGE, MAX_POST_LONG_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
    await (isPng
      ? resized.png(pngOptions)
      : resized.jpeg({ quality: JPEG_QUALITY })
    ).toFile(`${entry.src}.tmp`)

    fs.renameSync(`${entry.src}.tmp`, entry.src)
    const sizeAfter = fs.statSync(entry.src).size
    const saved = ((1 - sizeAfter / sizeBefore) * 100).toFixed(0)
    console.log(
      `  Resized ${entry.rel}: ${fmt(sizeBefore)} -> ${fmt(sizeAfter)} (${saved}% smaller)`
    )
  } else {
    console.log(
      `  ${entry.rel}: ${fmt(sizeBefore)} (${longEdge}px, already <= ${MAX_POST_LONG_EDGE}px)`
    )
  }

  // 2. Generate email variant (600px wide JPEG, same convention as covers)
  const emailDest = path.join(EMAIL_DIR, entry.rel)
  ensureDir(path.dirname(emailDest))

  let emailSize = 0
  for (
    let quality = EMAIL_QUALITY;
    quality >= EMAIL_MIN_QUALITY;
    quality -= 5
  ) {
    await sharp(entry.src)
      .rotate()
      .resize(EMAIL_COVER_WIDTH, undefined, { withoutEnlargement: true })
      .jpeg({ quality })
      .toFile(emailDest)
    emailSize = fs.statSync(emailDest).size
    if (emailSize <= EMAIL_POST_BUDGET_BYTES) break
  }

  console.log(
    `  Email variant -> images/email/${entry.rel} (${fmt(emailSize)})`
  )
}

function fmt(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024).toFixed(0)}KB`
}

async function main() {
  const entries = collectImages()
  const postEntries = collectPostImages()
  console.log(
    `Found ${entries.length} hero/cover images and ${postEntries.length} post images to process\n`
  )

  for (const entry of entries) {
    console.log(`Processing ${entry.rel}:`)
    await optimizeImage(entry)
    console.log()
  }

  for (const entry of postEntries) {
    console.log(`Processing ${entry.rel}:`)
    await optimizePostImage(entry)
    console.log()
  }

  console.log('Done!')
}

main()
