import { z } from 'zod/v4'
import rawCollections from '@/lib/collections/data.json'
import {
  COLLECTION_SLUGS,
  type CollectionDefinition,
  type CollectionEntry,
  type CollectionSlug,
  collectionEntryAnchor,
} from '@/lib/collections/model'
import type { Page } from '@/lib/content/types'

export type {
  AlphabeticalCollectionGroup,
  CollectionDefinition,
  CollectionEntry,
  CollectionReference,
  CollectionSlug,
} from '@/lib/collections/model'
export {
  alphabeticalCollectionGroups,
  COLLECTION_SLUGS,
  collectionEntryAnchor,
  filterCollectionEntries,
  isCollectionSlug,
} from '@/lib/collections/model'

const referenceSchema = z.strictObject({
  label: z.literal('Wikipedia'),
  href: z.string().url().startsWith('https://en.wikipedia.org/wiki/'),
})

const collectionEntrySchema = z.strictObject({
  term: z.string().trim().min(1),
  emphasis: z.literal('italic').optional(),
  definition: z.string().trim().min(1),
  reference: referenceSchema.optional(),
  suffix: z.string().trim().min(1).optional(),
})

const collectionSchema = z.strictObject({
  slug: z.enum(COLLECTION_SLUGS),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  entries: z.array(collectionEntrySchema).min(1),
})

const collectionsSchema = z.strictObject({
  diction: collectionSchema,
  contraptions: collectionSchema,
})

const parsedCollections = collectionsSchema.parse(rawCollections)

export const collections = parsedCollections satisfies Record<
  CollectionSlug,
  CollectionDefinition
>

export function getCollection(slug: CollectionSlug): CollectionDefinition {
  return collections[slug]
}

function entryTermMarkdown(entry: CollectionEntry): string {
  return entry.emphasis === 'italic' ? `_${entry.term}_` : entry.term
}

function entryReferenceMarkdown(entry: CollectionEntry): string {
  return entry.reference
    ? ` [${entry.reference.label}](${entry.reference.href})`
    : ''
}

function entrySuffixMarkdown(entry: CollectionEntry): string {
  return entry.suffix ? ` ${entry.suffix}` : ''
}

/**
 * Reconstructs the pre-migration list exactly. The fixed digest test around
 * this formatter proves that no term, emphasis, definition, link, or suffix
 * changed while the MDX lists moved into structured data.
 */
export function collectionLegacyMarkdown(
  collection: CollectionDefinition
): string {
  return `${collection.entries
    .map(
      (entry) =>
        `- **${entryTermMarkdown(entry)}** — ${entry.definition}${entryReferenceMarkdown(entry)}${entrySuffixMarkdown(entry)}`
    )
    .join('\n')}\n`
}

/**
 * Search and Bell read the same canonical entries as the UI. Keeping the
 * generated Markdown byte-equivalent to the pre-migration lists preserves
 * existing search chunks while the web presentation gains its own ordering.
 */
export function collectionPageMarkdown(
  collection: CollectionDefinition
): string {
  return collectionLegacyMarkdown(collection).trimEnd()
}

export function collectionPages(): Page[] {
  return COLLECTION_SLUGS.map((slug) => {
    const collection = getCollection(slug)
    return {
      slug,
      frontmatter: {
        title: collection.title,
        description: collection.description,
        featured: false,
        draft: false,
      },
      content: collectionPageMarkdown(collection),
    }
  })
}

/** Structural invariants consumed by the offline content check. */
export function collectionValidationProblems(): string[] {
  const problems: string[] = []

  for (const slug of COLLECTION_SLUGS) {
    const collection = getCollection(slug)
    if (collection.slug !== slug) {
      problems.push(`${slug}: structured collection slug is ${collection.slug}`)
    }

    const terms = new Set<string>()
    const anchors = new Set<string>()
    for (const entry of collection.entries) {
      const normalizedTerm = entry.term.toLocaleLowerCase('en-US')
      const anchor = collectionEntryAnchor(entry)
      if (terms.has(normalizedTerm)) {
        problems.push(`${slug}: duplicate term ${entry.term}`)
      }
      if (!anchor) problems.push(`${slug}: ${entry.term} has no usable anchor`)
      else if (anchors.has(anchor)) {
        problems.push(`${slug}: duplicate anchor #${anchor}`)
      }
      terms.add(normalizedTerm)
      anchors.add(anchor)
    }
  }

  return problems
}
