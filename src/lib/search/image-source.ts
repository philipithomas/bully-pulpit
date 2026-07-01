import fs from 'node:fs'
import path from 'node:path'
import { sha256Hex } from '@/lib/search/merkle'

export function publicImageFilePath(src: string): string {
  const rawPath = path.join(process.cwd(), 'public', src)
  if (fs.existsSync(rawPath)) return rawPath
  try {
    const decodedPath = path.join(
      process.cwd(),
      'public',
      decodeURIComponent(src)
    )
    return fs.existsSync(decodedPath) ? decodedPath : rawPath
  } catch {
    return rawPath
  }
}

export function publicImageDigest(src: string): string | undefined {
  const filePath = publicImageFilePath(src)
  if (!fs.existsSync(filePath)) return undefined
  return sha256Hex(fs.readFileSync(filePath).toString('base64'))
}
