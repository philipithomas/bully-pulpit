import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-images-'))
  tempDirs.push(dir)
  return dir
}

async function readImage(filePath: string) {
  return fs.readFile(filePath)
}

async function runOptimizer(filePath: string) {
  await execFileAsync(
    path.join(process.cwd(), 'node_modules/.bin/tsx'),
    [path.join(process.cwd(), 'scripts/optimize-images.ts'), filePath],
    { cwd: process.cwd() }
  )
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true }))
  )
})

describe('optimizeImage', () => {
  it('does not rewrite images that already fit the policy', async () => {
    const dir = await makeTempDir()
    const filePath = path.join(dir, 'already-small.jpg')
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: '#f4f4f2',
      },
    })
      .jpeg({ quality: 90 })
      .toFile(filePath)

    const before = await readImage(filePath)
    await runOptimizer(filePath)
    const after = await readImage(filePath)

    expect(after.equals(before)).toBe(true)
  })

  it('does not recompress an image after the first compliant output', async () => {
    const dir = await makeTempDir()
    const filePath = path.join(dir, 'oversized-edge.jpg')
    await sharp({
      create: {
        width: 5200,
        height: 300,
        channels: 3,
        background: '#2b4a3e',
      },
    })
      .jpeg({ quality: 95 })
      .toFile(filePath)

    await runOptimizer(filePath)
    const afterFirst = await readImage(filePath)
    const metadata = await sharp(filePath).metadata()
    await runOptimizer(filePath)
    const afterSecond = await readImage(filePath)

    expect(metadata.width).toBe(5120)
    expect(afterSecond.equals(afterFirst)).toBe(true)
  })
})
