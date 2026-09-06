import { slugify } from '@/lib/content/slugify'

export const COLLECTION_SLUGS = ['diction', 'contraptions'] as const
export type CollectionSlug = (typeof COLLECTION_SLUGS)[number]

export interface CollectionReference {
  label: 'Wikipedia'
  href: string
}

export interface CollectionEntry {
  term: string
  emphasis?: 'italic'
  definition: string
  reference?: CollectionReference
  suffix?: string
}

export interface CollectionDefinition {
  slug: CollectionSlug
  title: string
  description: string
  entries: CollectionEntry[]
}

export interface AlphabeticalCollectionGroup {
  letter: string
  entries: CollectionEntry[]
}

const collator = new Intl.Collator('en', { sensitivity: 'base' })

export function isCollectionSlug(slug: string): slug is CollectionSlug {
  return (COLLECTION_SLUGS as readonly string[]).includes(slug)
}

export function collectionEntryAnchor(entry: CollectionEntry): string {
  return slugify(entry.term)
}

export function alphabeticalCollectionGroups(
  entries: readonly CollectionEntry[]
): AlphabeticalCollectionGroup[] {
  const groups = new Map<string, CollectionEntry[]>()
  const sorted = [...entries].sort((a, b) => collator.compare(a.term, b.term))

  for (const entry of sorted) {
    const letter = entry.term.charAt(0).toLocaleUpperCase('en-US')
    const group = groups.get(letter)
    if (group) group.push(entry)
    else groups.set(letter, [entry])
  }

  return [...groups].map(([letter, groupedEntries]) => ({
    letter,
    entries: groupedEntries,
  }))
}

function normalizeForFilter(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
}

export function filterCollectionEntries(
  entries: readonly CollectionEntry[],
  query: string
): CollectionEntry[] {
  const normalizedQuery = normalizeForFilter(query.trim())
  if (!normalizedQuery) return [...entries]

  return entries.filter((entry) =>
    normalizeForFilter(
      [entry.term, entry.definition, entry.suffix, entry.reference?.label]
        .filter(Boolean)
        .join(' ')
    ).includes(normalizedQuery)
  )
}
