import { describe, expect, it } from 'vitest'
import {
  stargazingFavorites,
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
  it('keeps the personal ranking in public data', () => {
    expect(stargazingFavorites).toEqual([
      'Noma',
      'Quintonil',
      'Osteria Francescana',
      'Le Bernardin',
    ])
  })

  it('keeps one public row per restaurant', () => {
    expect(stargazingRestaurants).toHaveLength(55)
    const names = stargazingRestaurants.map((restaurant) =>
      restaurant.name.toLocaleLowerCase()
    )
    expect(new Set(names).size).toBe(names.length)
  })

  it('derives the public headline totals from the rows', () => {
    expect(stargazingStats).toEqual({
      restaurants: 55,
      starredRestaurants: 52,
      stars: 78,
      numberOneRestaurants: 3,
    })
  })

  it('includes the additional archive rows and visit-time rankings', () => {
    const restaurants = new Map(
      stargazingRestaurants.map((restaurant) => [restaurant.name, restaurant])
    )
    expect(restaurants.get('L’Atelier de Robuchon')?.stars).toBe(2)
    expect(restaurants.get('ABaC')?.stars).toBe(3)
    expect(restaurants.get('Tickets')?.worldsBest?.rank).toBe(32)
    expect(restaurants.get('Pujol')?.worldsBest?.rank).toBe(13)
    expect(restaurants.get('Quintonil')?.worldsBest?.rank).toBe(11)
    expect(restaurants.get('Don Julio')?.worldsBest?.rank).toBe(13)
    expect(restaurants.get('Rosetta')?.worldsBest?.rank).toBe(34)
    expect(restaurants.get('Lyle’s')?.worldsBest?.rank).toBe(33)
    expect(restaurants.get('Cosme')?.worldsBest?.rank).toBe(22)
    expect(restaurants.get('Indienne')?.stars).toBe(1)
    expect(restaurants.get('Omakase Yume')?.stars).toBe(1)
    expect(restaurants.get('Takumi Tatsuhiro')?.stars).toBe(1)
    expect(restaurants.get('Yaesu Sushi Umi')?.stars).toBe(2)
    expect(restaurants.get('SingleThread')?.stars).toBe(3)
    expect(restaurants.get('SingleThread')?.worldsBest?.rank).toBe(80)
    expect(restaurants.get('Alchemist')?.stars).toBe(2)
    expect(restaurants.get('Alchemist')?.worldsBest?.rank).toBe(8)
    expect(restaurants.get('Alchemist')?.worldsBest?.url).toContain('2024')
    expect(restaurants.get('Disfrutar')?.stars).toBe(2)
    expect(restaurants.get('Disfrutar')?.worldsBest?.rank).toBe(9)
    expect(restaurants.get('Disfrutar')?.worldsBest?.url).toContain('2019')
  })

  it('publishes only starred restaurants, Green Stars, or World-ranked rows', () => {
    expect(
      stargazingRestaurants.every(
        (restaurant) =>
          restaurant.stars > 0 ||
          restaurant.distinction === 'Green Star' ||
          restaurant.worldsBest !== undefined
      )
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
    expect(text).toContain('Don Julio | Buenos Aires')
    expect(text).toContain('Tickets | Barcelona')
    expect(text).toContain('Llevadura de Olla | Oaxaca City')
    expect(text).toContain('Máximo | Mexico City')
    expect(text).toContain('Rosetta | Mexico City')
    expect(text).toContain('OXTE | Paris')
    expect(text).toContain('Trishna | London')
    expect(text).toContain('Oriole | Chicago')
    expect(text).toContain('Alchemist | Copenhagen')
    expect(text).toContain('Disfrutar | Barcelona')
    expect(text).toContain('Indienne | Chicago')
    expect(text).toContain('Omakase Yume | Chicago')
    expect(text).toContain(
      'Cosme | New York City | Michelin: No Michelin stars'
    )
    expect(text).toContain('Takumi Tatsuhiro | Tokyo')
    expect(text).toContain('Yaesu Sushi Umi | Tokyo')
    expect(text).toContain('SingleThread | Healdsburg')
    expect(text).not.toContain('Michelin: Selected')
    expect(text).not.toMatch(/\b20\d{2}\b|Former|Historical|Closed/)
  })
})
