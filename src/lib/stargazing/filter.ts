import {
  michelinRecognition,
  type StargazingRestaurant,
} from '@/lib/stargazing/restaurants'

export type StargazingSortKey = 'name' | 'city' | 'stars' | 'world'
export type SortDirection = 'ascending' | 'descending'

const DIACRITICS_RE = /\p{Diacritic}/gu

export function normalizeStargazingSearch(value: string): string {
  return value.normalize('NFKD').replace(DIACRITICS_RE, '').toLocaleLowerCase()
}

function searchText(restaurant: StargazingRestaurant): string {
  return normalizeStargazingSearch(
    [
      restaurant.name,
      restaurant.city,
      michelinRecognition(restaurant),
      restaurant.worldsBest ? `No. ${restaurant.worldsBest.rank}` : undefined,
      ...(restaurant.searchAliases ?? []),
    ]
      .filter(Boolean)
      .join(' ')
  )
}

export function defaultSortDirection(key: StargazingSortKey): SortDirection {
  return key === 'stars' ? 'descending' : 'ascending'
}

export function filterAndSortRestaurants(
  restaurants: readonly StargazingRestaurant[],
  query: string,
  sortKey: StargazingSortKey,
  direction: SortDirection
): StargazingRestaurant[] {
  const terms = normalizeStargazingSearch(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const filtered =
    terms.length === 0
      ? restaurants
      : restaurants.filter((restaurant) => {
          const text = searchText(restaurant)
          return terms.every((term) => text.includes(term))
        })
  const multiplier = direction === 'ascending' ? 1 : -1

  return [...filtered].sort((a, b) => {
    let comparison = 0
    if (sortKey === 'name') {
      return a.name.localeCompare(b.name) * multiplier
    }
    if (sortKey === 'city') {
      comparison = a.city.localeCompare(b.city) || a.name.localeCompare(b.name)
      return comparison * multiplier
    }
    if (sortKey === 'stars') {
      comparison = a.stars - b.stars
      return comparison === 0
        ? a.name.localeCompare(b.name)
        : comparison * multiplier
    }
    if (sortKey === 'world') {
      const aRank = a.worldsBest?.rank ?? Number.POSITIVE_INFINITY
      const bRank = b.worldsBest?.rank ?? Number.POSITIVE_INFINITY
      comparison = aRank - bRank || a.name.localeCompare(b.name)
      // Unranked restaurants stay below ranked ones in either direction.
      if (!a.worldsBest && b.worldsBest) return 1
      if (a.worldsBest && !b.worldsBest) return -1
      return comparison === 0
        ? a.name.localeCompare(b.name)
        : comparison * multiplier
    }
    return 0
  })
}
