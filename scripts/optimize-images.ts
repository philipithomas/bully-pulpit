import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import {
  formatImageBytes,
  isPolicyImagePath,
  MAX_PUBLIC_IMAGE_BYTES,
  MAX_PUBLIC_IMAGE_EDGE,
} from '@/lib/content/image-policy'

const PUBLIC_IMAGES = path.join(process.cwd(), 'public/images')
const JPEG_QUALITIES = [90, 88, 85, 82, 80]
const WEBP_QUALITIES = [90, 88, 85, 82, 80]
const AVIF_QUALITIES = [80, 76, 72, 68, 64]

interface OptimizeResult {
  filePath: string
  originalBytes: number
  outputBytes: number
  originalWidth: number
  originalHeight: number
  outputWidth: number
  outputHeight: number
}

interface ImageCandidate {
  buffer: Buffer
  width: number
  height: number
}

function collectInputs(args: string[]): string[] {
  const roots = args.length > 0 ? args : [PUBLIC_IMAGES]
  const files: string[] = []

  for (const input of roots) {
    const full = path.resolve(input)
    if (!fs.existsSync(full)) {
      throw new Error(`${input} does not exist`)
    }
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      const stack = [full]
      while (stack.length > 0) {
        const dir = stack.pop() as string
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const child = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            stack.push(child)
          } else if (entry.isFile() && isPolicyImagePath(child)) {
            files.push(child)
          }
        }
      }
    } else if (stat.isFile() && isPolicyImagePath(full)) {
      files.push(full)
    }
  }

  return [...new Set(files)].sort()
}

function resizeOptions(width: number, height: number) {
  const longest = Math.max(width, height)
  if (longest <= MAX_PUBLIC_IMAGE_EDGE) return undefined
  return {
    width: width >= height ? MAX_PUBLIC_IMAGE_EDGE : undefined,
    height: height > width ? MAX_PUBLIC_IMAGE_EDGE : undefined,
    fit: 'inside' as const,
    withoutEnlargement: true,
  }
}

async function buildCandidate(
  filePath: string,
  quality?: number
): Promise<ImageCandidate> {
  const ext = path.extname(filePath).toLowerCase()
  let pipeline = sharp(filePath).rotate()
  const metadata = await pipeline.metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  const resize = resizeOptions(width, height)
  if (resize) pipeline = pipeline.resize(resize)

  if (ext === '.jpg' || ext === '.jpeg') {
    const buffer = await pipeline
      .jpeg({ mozjpeg: true, quality: quality ?? 90 })
      .toBuffer()
    const output = await sharp(buffer).metadata()
    return {
      buffer,
      width: output.width ?? 0,
      height: output.height ?? 0,
    }
  }
  if (ext === '.webp') {
    const buffer = await pipeline.webp({ quality: quality ?? 90 }).toBuffer()
    const output = await sharp(buffer).metadata()
    return {
      buffer,
      width: output.width ?? 0,
      height: output.height ?? 0,
    }
  }
  if (ext === '.avif') {
    const buffer = await pipeline.avif({ quality: quality ?? 80 }).toBuffer()
    const output = await sharp(buffer).metadata()
    return {
      buffer,
      width: output.width ?? 0,
      height: output.height ?? 0,
    }
  }
  const buffer = await pipeline
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer()
  const output = await sharp(buffer).metadata()
  return {
    buffer,
    width: output.width ?? 0,
    height: output.height ?? 0,
  }
}

function qualityLadder(filePath: string): Array<number | undefined> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return JPEG_QUALITIES
  if (ext === '.webp') return WEBP_QUALITIES
  if (ext === '.avif') return AVIF_QUALITIES
  return [undefined]
}

async function optimizeImage(filePath: string): Promise<OptimizeResult | null> {
  const stat = fs.statSync(filePath)
  const metadata = await sharp(filePath).metadata()
  const originalWidth = metadata.width ?? 0
  const originalHeight = metadata.height ?? 0
  const longest = Math.max(originalWidth, originalHeight)
  const needsOptimization =
    longest > MAX_PUBLIC_IMAGE_EDGE || stat.size > MAX_PUBLIC_IMAGE_BYTES

  if (!needsOptimization) return null

  let output: ImageCandidate | null = null
  for (const quality of qualityLadder(filePath)) {
    const candidate = await buildCandidate(filePath, quality)
    output = candidate
    if (
      candidate.buffer.byteLength <= MAX_PUBLIC_IMAGE_BYTES &&
      Math.max(candidate.width, candidate.height) <= MAX_PUBLIC_IMAGE_EDGE
    ) {
      break
    }
  }

  if (!output) return null
  const outputLongest = Math.max(output.width, output.height)
  if (
    output.buffer.byteLength > MAX_PUBLIC_IMAGE_BYTES ||
    outputLongest > MAX_PUBLIC_IMAGE_EDGE
  ) {
    const relative = path.relative(process.cwd(), filePath)
    throw new Error(
      `${relative} could not be optimized within policy (got ${output.width}x${output.height}, ${formatImageBytes(output.buffer.byteLength)}; max ${MAX_PUBLIC_IMAGE_EDGE}px, ${formatImageBytes(MAX_PUBLIC_IMAGE_BYTES)}). Downsize the source manually or export a smaller web master.`
    )
  }

  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, output.buffer)
  fs.renameSync(tmp, filePath)

  return {
    filePath,
    originalBytes: stat.size,
    outputBytes: output.buffer.byteLength,
    originalWidth,
    originalHeight,
    outputWidth: output.width,
    outputHeight: output.height,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const inputs = collectInputs(args)
  const changed: OptimizeResult[] = []

  for (const filePath of inputs) {
    const result = await optimizeImage(filePath)
    if (result) changed.push(result)
  }

  if (changed.length === 0) {
    console.log(
      `Images already fit policy: max ${MAX_PUBLIC_IMAGE_EDGE}px, max ${formatImageBytes(MAX_PUBLIC_IMAGE_BYTES)}`
    )
    return
  }

  console.log(
    `Optimized ${changed.length} image(s) to max ${MAX_PUBLIC_IMAGE_EDGE}px and ${formatImageBytes(MAX_PUBLIC_IMAGE_BYTES)}:`
  )
  for (const result of changed) {
    const relative = path.relative(process.cwd(), result.filePath)
    console.log(
      `  ${relative}: ${result.originalWidth}x${result.originalHeight} ${formatImageBytes(result.originalBytes)} -> ${result.outputWidth}x${result.outputHeight} ${formatImageBytes(result.outputBytes)}`
    )
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
