import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC = path.resolve(__dirname, '../public')
const IMAGES = path.join(PUBLIC, 'images')
const FULL_DIR = path.join(IMAGES, 'full')
const EMAIL_COVERS_DIR = path.join(IMAGES, 'email', 'covers')
const EMAIL_THUMBS_DIR = path.join(IMAGES, 'email', 'thumbnails')

const MAX_WEB_WIDTH = 2560
const EMAIL_COVER_WIDTH = 600
const EMAIL_THUMB_WIDTH = 200
const JPEG_QUALITY = 85
const FULL_QUALITY = 85
const EMAIL_QUALITY = 80

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

function fmt(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024).toFixed(0)}KB`
}

async function main() {
  const entries = collectImages()
  console.log(`Found ${entries.length} images to process\n`)

  for (const entry of entries) {
    console.log(`Processing ${entry.rel}:`)
    await optimizeImage(entry)
    console.log()
  }

  console.log('Done!')
}

main()
