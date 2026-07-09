import { describe, expect, it } from 'vitest'
import {
  filterAndSortRestaurants,
  normalizeStargazingSearch,
} from '@/lib/stargazing/filter'
import { stargazingRestaurants } from '@/lib/stargazing/restaurants'

describe('stargazing filtering and sorting', () => {
  it('searches city and restaurant names in memory', () => {
    const london = filterAndSortRestaurants(
      stargazingRestaurants,
      'London',
      'name',
      'ascending'
    )
    expect(london.map((restaurant) => restaurant.name)).toEqual([
      'Gymkhana',
      'Lyle’s',
      'Silo',
    ])

    const noma = filterAndSortRestaurants(
      stargazingRestaurants,
      'noma',
      'name',
      'ascending'
    )
    expect(noma.map((restaurant) => restaurant.name)).toEqual(['Noma'])
  })

  it('folds accents and supports search aliases', () => {
    expect(normalizeStargazingSearch('Café')).toBe('cafe')
    const results = filterAndSortRestaurants(
      stargazingRestaurants,
      'cafe NYC',
      'name',
      'ascending'
    )
    expect(results.map((restaurant) => restaurant.name)).toEqual([
      'Café Boulud',
      'Café China',
    ])

    const lyles = filterAndSortRestaurants(
      stargazingRestaurants,
      "Lyle's of London",
      'name',
      'ascending'
    )
    expect(lyles.map((restaurant) => restaurant.name)).toEqual(['Lyle’s'])
  })

  it('sorts star counts high to low', () => {
    const results = filterAndSortRestaurants(
      stargazingRestaurants,
      '',
      'stars',
      'descending'
    )
    expect(results[0].stars).toBe(3)
    expect(results.at(-1)?.stars).toBe(0)
  })

  it('sorts ranked restaurants best first and leaves unranked rows last', () => {
    const results = filterAndSortRestaurants(
      stargazingRestaurants,
      '',
      'world',
      'ascending'
    )
    expect(results[0].worldsBest?.rank).toBe(1)
    expect(results.at(-1)?.worldsBest).toBeUndefined()
  })
})
