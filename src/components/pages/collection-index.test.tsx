import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CollectionIndex } from '@/components/pages/collection-index'
import { getCollection } from '@/lib/collections'
import {
  alphabeticalCollectionGroups,
  collectionEntryAnchor,
  filterCollectionEntries,
} from '@/lib/collections/model'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('>', '&gt;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;')
}

describe('CollectionIndex', () => {
  it('server-renders the complete collection for no-JavaScript browsing', () => {
    const html = renderToStaticMarkup(
      <CollectionIndex collection={getCollection('diction')} />
    )

    expect(html).toContain('type="search"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('151 entries')
    expect(html).toContain('id="gavage"')
    expect(html).toContain('id="chockablock"')
    expect(html).toContain('data-bell-selectable=""')
    expect(html.indexOf('type="search"')).toBeLessThan(
      html.indexOf('data-bell-selectable=""')
    )
    expect(html.indexOf('data-bell-selectable=""')).toBeLessThan(
      html.indexOf('<dd')
    )
    expect(html).toContain('lg:grid-cols-2')
    expect(html).not.toContain('border-t')
    expect(html).not.toContain('border-y')
  })

  it('renders durable entry links and preserved reference markup', () => {
    const html = renderToStaticMarkup(
      <CollectionIndex collection={getCollection('contraptions')} />
    )

    expect(html).toContain('href="#pinion"')
    expect(html).toContain('id="pinion"')
    expect(html).toMatch(
      /<div id="pinion" data-bell-source-anchor="" class="scroll-mt-6">/
    )
    expect(html).toContain('https://en.wikipedia.org/wiki/Pinion')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('👉🏻')
  })

  it('renders one complete visible row for every machine-readable entry', () => {
    for (const slug of ['diction', 'contraptions'] as const) {
      const collection = getCollection(slug)
      const html = renderToStaticMarkup(
        <CollectionIndex collection={collection} />
      )
      const renderedAnchors = [...html.matchAll(/<div id="([^"]+)"/g)].map(
        (match) => match[1]
      )

      expect(renderedAnchors).toEqual(
        alphabeticalCollectionGroups(collection.entries).flatMap((group) =>
          group.entries.map(collectionEntryAnchor)
        )
      )
      expect(html.match(/<dd/g)).toHaveLength(collection.entries.length)
      for (const entry of collection.entries) {
        expect(html).toContain(escapeHtml(entry.term))
        expect(html).toContain(escapeHtml(entry.definition))
      }
    }
  })

  it('filters terms and definitions without case or accent sensitivity', () => {
    const entries = getCollection('diction').entries
    expect(filterCollectionEntries(entries, 'FOLKELIG')).toHaveLength(1)
    expect(filterCollectionEntries(entries, 'norwegian and danish')).toEqual([
      expect.objectContaining({ term: 'Folkelig' }),
    ])
    expect(filterCollectionEntries(entries, 'does not exist')).toEqual([])
  })

  it('sorts entries into useful alphabetical groups', () => {
    const groups = alphabeticalCollectionGroups(
      getCollection('contraptions').entries
    )
    expect(groups[0].letter).toBe('A')
    expect(groups.at(-1)?.letter).toBe('Z')
    for (const group of groups) {
      expect(
        group.entries.every((entry) => entry.term.startsWith(group.letter))
      ).toBe(true)
    }
  })
})
