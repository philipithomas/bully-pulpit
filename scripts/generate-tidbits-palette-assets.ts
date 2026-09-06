import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { TIDBITS_PALETTES, tidbitsAsset } from '@/lib/tidbits/palette'
import { TIDBITS_WORDMARK_PATHS } from '@/lib/tidbits/wordmark'

// Earlier asset versions stay untouched so already-delivered emails retain
// their original artwork. New messages use the capitalized wordmark version.
async function main() {
  const root = join(process.cwd(), 'public')
  await mkdir(join(root, 'images/tidbits-palettes'), { recursive: true })
  for (const palette of TIDBITS_PALETTES) {
    const svg = (color: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="1688" height="369" viewBox="0 0 1688 369" fill="${color}">${TIDBITS_WORDMARK_PATHS.map((path) => `<path d="${path}"/>`).join('')}</svg>\n`
    const file = (kind: Parameters<typeof tidbitsAsset>[1]) =>
      join(root, tidbitsAsset(palette, kind))
    await writeFile(file('wordmark'), svg(palette.accent))
    await writeFile(
      file('icon'),
      `<svg xmlns="http://www.w3.org/2000/svg" width="790" height="790" viewBox="0 0 790 790"><rect width="790" height="790" fill="${palette.paper}"/><path d="${TIDBITS_WORDMARK_PATHS[0]}" fill="${palette.accent}" transform="translate(196.78 143.74) scale(1.36)"/></svg>\n`
    )
    for (const kind of ['email', 'email-dark'] as const) {
      await sharp(
        Buffer.from(svg(kind === 'email' ? palette.accent : palette.dark))
      )
        .resize({ width: 416 })
        .png()
        .toFile(file(kind))
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
