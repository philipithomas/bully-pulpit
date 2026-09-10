import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
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

const LEGACY_MARKDOWN_SHA256 = {
  diction: '1e4c55684a66f01e0024e368ae7e2325d1fb3e7564af3cba614c60e514c01942',
  contraptions:
    '90b07d653aa91cb9e37d9acb6d44e381298127a3bb2b324fc3fcf40e3302eece',
} as const

describe('structured collections', () => {
  it('keeps the current collections stable in legacy Markdown', () => {
    for (const slug of COLLECTION_SLUGS) {
      const digest = createHash('sha256')
        .update(collectionLegacyMarkdown(getCollection(slug)))
        .digest('hex')

      expect(digest).toBe(LEGACY_MARKDOWN_SHA256[slug])
    }
  })

  it('includes every current entry', () => {
    expect(getCollection('diction').entries).toHaveLength(153)
    expect(getCollection('contraptions').entries).toHaveLength(77)
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

  it('does not retain competing MDX collection sources', () => {
    for (const slug of COLLECTION_SLUGS) {
      expect(
        fs.existsSync(path.join(process.cwd(), 'content/pages', `${slug}.mdx`))
      ).toBe(false)
    }
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
