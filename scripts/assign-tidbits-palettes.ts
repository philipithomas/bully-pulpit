import fs from 'node:fs'
import path from 'node:path'
import { getPhotoPosts } from '@/lib/content/photo-navigation'
import { assignTidbitsPalettes } from '@/lib/tidbits/assign-palettes'

const registry = path.join(
  process.cwd(),
  'src/lib/tidbits/palette-assignments.json'
)

try {
  const previous = fs.readFileSync(registry, 'utf8')
  const existing: Record<string, string> = JSON.parse(previous)
  const slugs = getPhotoPosts('tidbits').map((post) => post.slug)
  const assignments = assignTidbitsPalettes(slugs, existing)
  const updated = `${JSON.stringify(assignments, null, 2)}\n`
  if (updated !== previous) fs.writeFileSync(registry, updated)
  const added = slugs.filter((slug) => !Object.hasOwn(existing, slug))
  for (const slug of added) console.log(`${slug}: ${assignments[slug]}`)
  console.log(
    `Tidbits palettes: ${added.length} new assignments; existing assignments preserved.`
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
