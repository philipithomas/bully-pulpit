import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { TIDBITS_PALETTES, tidbitsAsset } from '@/lib/tidbits/palette'
import { TIDBITS_WORDMARK_PATHS } from '@/lib/tidbits/wordmark'

async function writeAsset(file: string, content: string | Buffer) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content)
  try {
    await writeFile(file, bytes, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (!(await readFile(file)).equals(bytes)) {
      throw new Error(
        `Refusing to overwrite published asset ${file}. Use new versioned filenames in tidbitsAsset() before regenerating changed artwork.`
      )
    }
  }
}

// Current rendering uses the original lowercase palette assets. Cochineal and
// v2 URLs stay untouched so already-delivered emails retain their artwork.
async function main() {
  const root = join(process.cwd(), 'public')
  await mkdir(join(root, 'images/tidbits-palettes'), { recursive: true })
  const originalIcon = await readFile(
    join(root, 'images/tidbits-icon.svg'),
    'utf8'
  )
  for (const palette of TIDBITS_PALETTES) {
    const svg = (color: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="1601" height="369" viewBox="0 0 1601 369" fill="${color}">${TIDBITS_WORDMARK_PATHS.map((path) => `<path d="${path}"/>`).join('')}</svg>\n`
    const file = (kind: Parameters<typeof tidbitsAsset>[1]) =>
      join(root, tidbitsAsset(palette, kind))
    await writeAsset(file('wordmark'), svg(palette.accent))
    await writeAsset(
      file('icon'),
      originalIcon
        .replaceAll('#F6EAE9', palette.paper)
        .replaceAll('#F41986', palette.accent)
    )
    for (const kind of ['email', 'email-dark'] as const) {
      await writeAsset(
        file(kind),
        await sharp(
          Buffer.from(svg(kind === 'email' ? palette.accent : palette.dark))
        )
          .resize({ width: 416 })
          .png()
          .toBuffer()
      )
    }
  }
  console.log(
    `Generated ${TIDBITS_PALETTES.length} Tidbits palettes (SVG wordmarks/icons and 4× email PNGs).`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
