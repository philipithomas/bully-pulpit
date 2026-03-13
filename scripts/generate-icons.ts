import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SOURCE = path.resolve(__dirname, '../icon.png')
const PUBLIC = path.resolve(__dirname, '../public')

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source image not found: ${SOURCE}`)
    process.exit(1)
  }

  // Generate PNG icons at each size
  const sizes = [
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
  ]

  for (const { name, size } of sizes) {
    await sharp(SOURCE)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(path.join(PUBLIC, name))
    console.log(`Generated ${name} (${size}x${size})`)
  }

  // Generate favicon.ico as a 32x32 PNG renamed to .ico
  // Modern browsers accept PNG data in .ico files
  await sharp(SOURCE)
    .resize(32, 32, { fit: 'cover' })
    .png()
    .toFile(path.join(PUBLIC, 'favicon.ico'))
  console.log('Generated favicon.ico (32x32)')

  // Generate OG image (1200x630) with icon centered on dark background
  const ogWidth = 1200
  const ogHeight = 630
  const iconSize = 400
  const bg = '#111110'

  const resizedIcon = await sharp(SOURCE)
    .resize(iconSize, iconSize, { fit: 'contain' })
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: ogWidth,
      height: ogHeight,
      channels: 4,
      background: bg,
    },
  })
    .composite([
      {
        input: resizedIcon,
        left: Math.round((ogWidth - iconSize) / 2),
        top: Math.round((ogHeight - iconSize) / 2),
      },
    ])
    .png()
    .toFile(path.join(PUBLIC, 'og-image.png'))
  console.log(`Generated og-image.png (${ogWidth}x${ogHeight})`)

  // Copy SVG icon to public for modern browsers
  const svgSource = path.resolve(__dirname, '../icon.svg')
  if (fs.existsSync(svgSource)) {
    fs.copyFileSync(svgSource, path.join(PUBLIC, 'icon.svg'))
    console.log('Copied icon.svg to public/')
  }

  console.log('\nAll icons generated in public/')
}

main()
