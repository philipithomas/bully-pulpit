import { describe, expect, it } from 'vitest'
import {
  stargazingPublicText,
  stargazingRestaurants,
  stargazingStats,
} from '@/lib/stargazing/restaurants'

const PUBLIC_KEYS = new Set([
  'name',
  'city',
  'stars',
  'distinction',
  'worldsBest',
  'searchAliases',
])
const WORLD_KEYS = new Set(['rank', 'url', 'numberOneWhileVisited'])

describe('stargazing restaurant data', () => {
  it('keeps one public row per restaurant', () => {
    expect(stargazingRestaurants).toHaveLength(36)
    const names = stargazingRestaurants.map((restaurant) =>
      restaurant.name.toLocaleLowerCase()
    )
    expect(new Set(names).size).toBe(names.length)
  })

  it('derives the public headline totals from the rows', () => {
    expect(stargazingStats).toEqual({
      restaurants: 36,
      starredRestaurants: 30,
      stars: 47,
      numberOneRestaurants: 3,
    })
  })

  it('keeps Bib Gourmands only when they also have a World ranking', () => {
    const bibGourmands = stargazingRestaurants.filter(
      (restaurant) => restaurant.distinction === 'Bib Gourmand'
    )
    expect(
      bibGourmands.every((restaurant) => Boolean(restaurant.worldsBest))
    ).toBe(true)
  })

  it('contains only allowlisted public fields', () => {
    for (const restaurant of stargazingRestaurants) {
      for (const key of Object.keys(restaurant)) {
        expect(PUBLIC_KEYS.has(key)).toBe(true)
      }
      for (const key of Object.keys(restaurant.worldsBest ?? {})) {
        expect(WORLD_KEYS.has(key)).toBe(true)
      }
    }
    const serialized = JSON.stringify(stargazingRestaurants)
    expect(serialized).not.toMatch(/date visited|source calendar|visitedOn/i)
  })

  it('fits the full public list inside Bell page context', () => {
    const text = stargazingPublicText()
    expect(text.length).toBeLessThan(4000)
    expect(text).toContain('Silo | London')
    expect(text).toContain('Noma | Copenhagen')
    expect(text).toContain('Eleven Madison Park')
    expect(text).toContain('Osteria Francescana')
    expect(text).not.toMatch(/\b20\d{2}\b|Former|Historical|Closed/)
  })
})
