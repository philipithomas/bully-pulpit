export type MichelinStars = 0 | 1 | 2 | 3

export type MichelinDistinction = 'Green Star'

export interface WorldsBestRecognition {
  rank: number
  url: string
  numberOneWhileVisited?: boolean
}

/**
 * The deliberately public subset of the private restaurant audit. Dates,
 * calendar provenance, and raw research notes never belong in this module:
 * every field here is serialized into the public page.
 */
export interface StargazingRestaurant {
  name: string
  city: string
  stars: MichelinStars
  distinction?: MichelinDistinction
  worldsBest?: WorldsBestRecognition
  searchAliases?: readonly string[]
}

const WORLDS_BEST_ARCHIVE =
  'https://www.theworlds50best.com/restaurants/best-in-the-world/previous-list/'
const WORLDS_BEST_2018 = `${WORLDS_BEST_ARCHIVE}2018`
const WORLDS_BEST_2019 = `${WORLDS_BEST_ARCHIVE}2019`
const WORLDS_BEST_2021 = `${WORLDS_BEST_ARCHIVE}2021`
const WORLDS_BEST_2024 = `${WORLDS_BEST_ARCHIVE}2024`

export const stargazingRestaurants: readonly StargazingRestaurant[] = [
  { name: 'The Progress', city: 'San Francisco', stars: 1 },
  { name: 'Spruce', city: 'San Francisco', stars: 1 },
  {
    name: 'Terra',
    city: 'St. Helena',
    stars: 1,
    searchAliases: ['Terra Restaurant'],
  },
  {
    name: 'The Restaurant at Meadowood',
    city: 'St. Helena',
    stars: 3,
    searchAliases: ['Restaurant at Meadowood'],
  },
  {
    name: 'Bouchon',
    city: 'Yountville',
    stars: 1,
  },
  {
    name: 'Atelier Crenn',
    city: 'San Francisco',
    stars: 3,
    worldsBest: {
      rank: 96,
      url: WORLDS_BEST_ARCHIVE,
    },
  },
  {
    name: 'Pujol',
    city: 'Mexico City',
    stars: 2,
    worldsBest: {
      rank: 13,
      url: WORLDS_BEST_2018,
    },
  },
  { name: 'Octavia', city: 'San Francisco', stars: 1 },
  {
    name: 'Le Bernardin',
    city: 'New York City',
    stars: 3,
    worldsBest: {
      rank: 26,
      url: WORLDS_BEST_2018,
    },
    searchAliases: ['NYC'],
  },
  {
    name: 'The Four Horsemen',
    city: 'Brooklyn',
    stars: 1,
    searchAliases: ['New York City', 'NYC'],
  },
  {
    name: 'COTE Korean Steakhouse',
    city: 'New York City',
    stars: 1,
    searchAliases: ['Cote', 'NYC'],
  },
  {
    name: 'Tamarind Tribeca',
    city: 'New York City',
    stars: 1,
    searchAliases: ['NYC'],
  },
  { name: 'Ever', city: 'Chicago', stars: 2 },
  { name: 'Oriole', city: 'Chicago', stars: 2 },
  { name: 'Indienne', city: 'Chicago', stars: 1 },
  { name: 'Omakase Yume', city: 'Chicago', stars: 1 },
  { name: 'Roister', city: 'Chicago', stars: 1 },
  {
    name: 'Noma',
    city: 'Copenhagen',
    stars: 3,
    worldsBest: {
      rank: 1,
      url: 'https://www.theworlds50best.com/restaurants/best-in-the-world/awards/best-of-the-best/Noma.html',
      numberOneWhileVisited: true,
    },
  },
  {
    name: 'Alchemist',
    city: 'Copenhagen',
    stars: 2,
    worldsBest: {
      rank: 8,
      url: WORLDS_BEST_2024,
    },
  },
  { name: 'EL Ideas', city: 'Chicago', stars: 1 },
  {
    name: 'Quintonil',
    city: 'Mexico City',
    stars: 2,
    worldsBest: {
      rank: 11,
      url: WORLDS_BEST_2018,
    },
  },
  {
    name: 'Sixty Three Clinton',
    city: 'New York City',
    stars: 1,
    searchAliases: ['63 Clinton', 'NYC'],
  },
  { name: 'Silo', city: 'London', stars: 0, distinction: 'Green Star' },
  {
    name: 'Café China',
    city: 'New York City',
    stars: 1,
    searchAliases: ['Cafe China', 'NYC'],
  },
  {
    name: 'Blackbelly Market & Restaurant',
    city: 'Boulder',
    stars: 0,
    distinction: 'Green Star',
  },
  {
    name: 'Café Boulud',
    city: 'New York City',
    stars: 1,
    searchAliases: ['Cafe Boulud', 'NYC'],
  },
  { name: 'Sorrel', city: 'San Francisco', stars: 1 },
  { name: 'Rich Table', city: 'San Francisco', stars: 1 },
  { name: '7 Adams', city: 'San Francisco', stars: 1 },
  { name: 'Frances', city: 'San Francisco', stars: 1 },
  { name: 'Sushi Masuda', city: 'Tokyo', stars: 2 },
  { name: 'Takumi Tatsuhiro', city: 'Tokyo', stars: 1 },
  { name: 'Yaesu Sushi Umi', city: 'Tokyo', stars: 2 },
  { name: 'Mister Jiu’s', city: 'San Francisco', stars: 1 },
  {
    name: 'Sons & Daughters',
    city: 'San Francisco',
    stars: 2,
    distinction: 'Green Star',
  },
  {
    name: 'Los Danzantes Oaxaca',
    city: 'Oaxaca City',
    stars: 1,
    distinction: 'Green Star',
  },
  { name: 'Llevadura de Olla', city: 'Oaxaca City', stars: 1 },
  {
    name: 'Máximo',
    city: 'Mexico City',
    stars: 1,
    searchAliases: ['Maximo', 'Máximo Bistrot', 'Maximo Bistrot'],
  },
  {
    name: 'Rosetta',
    city: 'Mexico City',
    stars: 1,
    worldsBest: {
      rank: 34,
      url: WORLDS_BEST_2024,
    },
  },
  { name: 'OXTE', city: 'Paris', stars: 1 },
  {
    name: 'L’Atelier de Robuchon',
    city: 'Paris',
    stars: 2,
    searchAliases: ["L'Atelier de Robuchon"],
  },
  { name: 'Il Palagio', city: 'Florence', stars: 1 },
  { name: 'ABaC', city: 'Barcelona', stars: 3 },
  {
    name: 'Tickets',
    city: 'Barcelona',
    stars: 1,
    worldsBest: {
      rank: 32,
      url: WORLDS_BEST_2018,
    },
    searchAliases: ['Tickets tapas bar'],
  },
  { name: 'Nico', city: 'San Francisco', stars: 1 },
  {
    name: 'Lyle’s',
    city: 'London',
    stars: 1,
    worldsBest: {
      rank: 33,
      url: WORLDS_BEST_2019,
    },
    searchAliases: ["Lyle's of London", 'Lyles'],
  },
  { name: 'Angler', city: 'San Francisco', stars: 1 },
  {
    name: 'Don Julio',
    city: 'Buenos Aires',
    stars: 1,
    worldsBest: {
      rank: 13,
      url: WORLDS_BEST_2021,
    },
  },
  {
    name: 'Cosme',
    city: 'New York City',
    stars: 0,
    worldsBest: {
      rank: 22,
      url: WORLDS_BEST_2021,
    },
    searchAliases: ['NYC'],
  },
  { name: 'Gymkhana', city: 'London', stars: 1 },
  { name: 'Trishna', city: 'London', stars: 1 },
  {
    name: 'Eleven Madison Park',
    city: 'New York City',
    stars: 3,
    worldsBest: {
      rank: 1,
      url: 'https://www.theworlds50best.com/restaurants/best-in-the-world/awards/best-of-the-best/eleven-madison-park.html',
      numberOneWhileVisited: true,
    },
    searchAliases: ['EMP', 'NYC'],
  },
  {
    name: 'Osteria Francescana',
    city: 'Modena',
    stars: 3,
    worldsBest: {
      rank: 1,
      url: 'https://www.theworlds50best.com/restaurants/best-in-the-world/awards/best-of-the-best/osteria-francescana.html',
      numberOneWhileVisited: true,
    },
  },
]

export function michelinRecognition(restaurant: StargazingRestaurant): string {
  if (restaurant.stars > 0) {
    const stars = `${restaurant.stars} ${restaurant.stars === 1 ? 'star' : 'stars'}`
    return restaurant.distinction
      ? `${stars} (${restaurant.distinction.toLowerCase()})`
      : stars
  }
  return restaurant.distinction ?? 'No Michelin stars'
}

export const stargazingStats = {
  restaurants: stargazingRestaurants.length,
  starredRestaurants: stargazingRestaurants.filter(
    (restaurant) => restaurant.stars > 0
  ).length,
  stars: stargazingRestaurants.reduce(
    (total, restaurant) => total + restaurant.stars,
    0
  ),
  numberOneRestaurants: stargazingRestaurants.filter(
    (restaurant) => restaurant.worldsBest?.numberOneWhileVisited
  ).length,
} as const

export const stargazingSummary = `I have eaten at ${stargazingStats.starredRestaurants} Michelin-starred restaurants, totaling ${stargazingStats.stars} stars. ${stargazingStats.numberOneRestaurants} were ranked No. 1 in the world when I visited.`

export function stargazingPublicText(): string {
  const rows = stargazingRestaurants.map((restaurant) => {
    const ranking = restaurant.worldsBest
      ? `; World's 50 Best at my visit: No. ${restaurant.worldsBest.rank}`
      : ''
    return `- ${restaurant.name} | ${restaurant.city} | Michelin: ${michelinRecognition(restaurant)}${ranking}`
  })

  return [
    stargazingSummary,
    'I enjoy fine dining as a lens to explore local culture and craftspeople performing at the highest level.',
    'I count each restaurant once. Michelin stars reflect the Michelin Guide rating at the time I visited, with some grace for nearby promotions and places the Guide reached later. World rankings reflect the World’s 50 Best list at the time I visited.',
    'Restaurants:',
    ...rows,
  ].join('\n')
}
