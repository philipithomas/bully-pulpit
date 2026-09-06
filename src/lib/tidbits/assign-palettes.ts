import { TIDBITS_PALETTES, type TidbitsPaletteId } from '@/lib/tidbits/palette'

type Assignments = Readonly<Record<string, string>>

const REGISTRY = 'src/lib/tidbits/palette-assignments.json'
const PALETTE_IDS = new Set<string>(TIDBITS_PALETTES.map(({ id }) => id))

/** Slugs must be in the same newest-first order as the photo gallery. */
export function validateTidbitsPaletteAssignments(
  slugs: readonly string[],
  assignments: Assignments
): string[] {
  const errors = assignmentErrors(slugs, assignments)
  for (const slug of slugs) {
    if (!Object.hasOwn(assignments, slug)) {
      errors.push(
        `${slug}: no saved Tidbits palette — run \`pnpm tidbits:palettes\``
      )
    }
  }
  return errors
}

function assignmentErrors(
  slugs: readonly string[],
  assignments: Assignments
): string[] {
  const errors: string[] = []
  for (const [slug, id] of Object.entries(assignments)) {
    if (!PALETTE_IDS.has(id)) {
      errors.push(
        `${slug}: invalid Tidbits palette ${id} — correct ${REGISTRY}`
      )
    }
  }
  // Two photos have one unique pair; larger galleries also check the last-to-
  // first transition so a circular swipe always reveals a different color.
  const pairs = slugs.length === 2 ? 1 : slugs.length > 2 ? slugs.length : 0
  for (let index = 0; index < pairs; index++) {
    const slug = slugs[index]
    const neighbor = slugs[(index + 1) % slugs.length]
    const id = assignments[slug]
    if (PALETTE_IDS.has(id) && id === assignments[neighbor]) {
      errors.push(
        `${slug} and ${neighbor}: adjacent Tidbits photos share ${id} — explicitly correct an assignment in ${REGISTRY}; existing colors are never reassigned automatically`
      )
    }
  }
  return errors
}

/**
 * Save only missing published assignments. Every choice excludes both circular
 * neighbors when assigned, then prefers the least-used published palette. The
 * palette order resolves ties, so batches and reruns are deterministic. With
 * five colors and at most two excluded neighbors, later gaps always have a
 * valid choice. Retain removed/draft assignments for a stable return to print.
 */
export function assignTidbitsPalettes(
  slugs: readonly string[],
  existing: Assignments
): Record<string, TidbitsPaletteId> {
  const errors = assignmentErrors(slugs, existing)
  if (errors.length > 0) throw new Error(errors.join('\n'))

  const assignments = { ...existing } as Record<string, TidbitsPaletteId>
  const counts = new Map(TIDBITS_PALETTES.map(({ id }) => [id, 0]))
  for (const slug of slugs) {
    const id = assignments[slug]
    if (Object.hasOwn(assignments, slug)) counts.set(id, counts.get(id)! + 1)
  }

  for (const [index, slug] of slugs.entries()) {
    if (Object.hasOwn(assignments, slug)) continue
    const excluded = new Set([
      assignments[slugs[(index - 1 + slugs.length) % slugs.length]],
      assignments[slugs[(index + 1) % slugs.length]],
    ])
    const candidates = TIDBITS_PALETTES.filter(({ id }) => !excluded.has(id))
    const { id } = candidates.reduce((best, candidate) =>
      counts.get(candidate.id)! < counts.get(best.id)! ? candidate : best
    )
    assignments[slug] = id
    counts.set(id, counts.get(id)! + 1)
  }

  return Object.fromEntries(
    Object.entries(assignments).sort(([a], [b]) => a.localeCompare(b, 'en'))
  )
}
