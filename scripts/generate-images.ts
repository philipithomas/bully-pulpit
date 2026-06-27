import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC = path.resolve(__dirname, '../public')
const IMAGES = path.join(PUBLIC, 'images')
const COVERS_DIR = path.join(IMAGES, 'covers')
const OG_COVERS_DIR = path.join(IMAGES, 'og/covers')

const OG_COVER_WIDTH = 1200
const OG_COVER_HEIGHT = 630
const JPEG_QUALITY = 85

interface CoverEntry {
  src: string
  file: string
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function collectCoverImages(): CoverEntry[] {
  if (!fs.existsSync(COVERS_DIR)) return []

  return fs
    .readdirSync(COVERS_DIR)
    .filter((file) => /\.(jpe?g|png)$/i.test(file))
    .map((file) => ({ src: path.join(COVERS_DIR, file), file }))
}

function ogCoverBasename(file: string): string {
  return `${path.parse(file).name}.jpg`
}

function fmt(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024).toFixed(0)}KB`
}

async function generateOgCover(entry: CoverEntry) {
  const dest = path.join(OG_COVERS_DIR, ogCoverBasename(entry.file))
  ensureDir(OG_COVERS_DIR)

  await sharp(entry.src)
    .rotate()
    .resize(OG_COVER_WIDTH, OG_COVER_HEIGHT, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(dest)

  const size = fs.statSync(dest).size
  console.log(
    `  Open Graph cover -> images/og/covers/${path.basename(dest)} (${fmt(size)})`
  )
}

async function main() {
  const covers = collectCoverImages()
  console.log(`Found ${covers.length} cover images to process\n`)

  for (const cover of covers) {
    console.log(`Processing covers/${cover.file}:`)
    await generateOgCover(cover)
    console.log()
  }

  console.log('Done!')
}

main()
