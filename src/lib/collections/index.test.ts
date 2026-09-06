import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  COLLECTION_SLUGS,
  collectionEntryAnchor,
  collectionLegacyMarkdown,
  collectionPageMarkdown,
  collectionPages,
  collectionValidationProblems,
  getCollection,
} from '@/lib/collections'

const PRE_MIGRATION_SHA256 = {
  diction: '088ebd7c482134a82c685d2ea60753f2c01607d33594b5f5b7457eaec9965165',
  contraptions:
    'e2a9d277dd2c7b8c9f33f79463ba721647b004c24ce799da786856fbc04d7ee9',
} as const

describe('structured collections', () => {
  it('preserves the exact pre-migration MDX entry lists', () => {
    for (const slug of COLLECTION_SLUGS) {
      const digest = createHash('sha256')
        .update(collectionLegacyMarkdown(getCollection(slug)))
        .digest('hex')

      expect(digest).toBe(PRE_MIGRATION_SHA256[slug])
    }
  })

  it('retains every existing entry', () => {
    expect(getCollection('diction').entries).toHaveLength(151)
    expect(getCollection('contraptions').entries).toHaveLength(75)
  })

  it('has valid, unique terms and durable anchors', () => {
    expect(collectionValidationProblems()).toEqual([])

    for (const slug of COLLECTION_SLUGS) {
      const anchors = getCollection(slug).entries.map(collectionEntryAnchor)
      expect(new Set(anchors).size).toBe(anchors.length)
    }
  })

  it('feeds search and Bell markdown from every canonical entry', () => {
    for (const slug of COLLECTION_SLUGS) {
      const collection = getCollection(slug)
      const markdown = collectionPageMarkdown(collection)

      for (const entry of collection.entries) {
        expect(markdown).toContain(entry.term)
        expect(markdown).toContain(entry.definition)
        if (entry.reference) expect(markdown).toContain(entry.reference.href)
      }
    }
  })

  it('builds content pages from the structured source', () => {
    const pages = collectionPages()
    expect(pages.map((page) => page.slug)).toEqual(COLLECTION_SLUGS)
    expect(pages[0].content).toBe(
      collectionPageMarkdown(getCollection('diction'))
    )
  })

  it('preserves term emphasis and trailing marks', () => {
    expect(
      getCollection('diction').entries.find(
        (entry) => entry.term === 'Folkelig'
      )
    ).toMatchObject({ emphasis: 'italic' })
    expect(
      getCollection('contraptions').entries.find(
        (entry) => entry.term === 'Manicule'
      )
    ).toMatchObject({ suffix: '👉🏻' })
  })
})
