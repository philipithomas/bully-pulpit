import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SOURCE = path.resolve(__dirname, '../../ptsq_color.jpg')
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

  console.log('\nAll icons generated in public/')
}

main()
