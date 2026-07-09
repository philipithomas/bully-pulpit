'use client'

import { Clover, Search, Star } from 'lucide-react'
import { type ChangeEvent, useCallback, useId, useState } from 'react'
import {
  defaultSortDirection,
  filterAndSortRestaurants,
  type SortDirection,
  type StargazingSortKey,
} from '@/lib/stargazing/filter'
import type { StargazingRestaurant } from '@/lib/stargazing/restaurants'

interface StargazingTableProps {
  restaurants: readonly StargazingRestaurant[]
}

interface SortableHeaderProps {
  active: boolean
  direction: SortDirection
  label: string
  onSort: (key: StargazingSortKey) => void
  sortKey: StargazingSortKey
  className?: string
}

const MOBILE_SORT_OPTIONS: { value: StargazingSortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'city', label: 'City' },
  { value: 'stars', label: 'Stars' },
  { value: 'world', label: 'World' },
]

const STAR_POSITIONS = [1, 2, 3] as const

function starLabel(stars: number): string {
  return `${stars} Michelin ${stars === 1 ? 'star' : 'stars'}`
}

function SortableHeader({
  active,
  className,
  direction,
  label,
  onSort,
  sortKey,
}: SortableHeaderProps) {
  const handleClick = useCallback(() => onSort(sortKey), [onSort, sortKey])

  return (
    <th
      scope="col"
      aria-sort={active ? direction : undefined}
      className={`sticky top-0 z-10 border-gray-300 border-b bg-gray-050 px-4 py-3 text-left align-bottom font-sans font-semibold text-gray-700 text-xs ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-between gap-2 text-left hover:text-gray-950"
      >
        <span>{label}</span>
        <span aria-hidden="true" className="font-mono text-gray-400">
          {active ? (direction === 'ascending' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

function MobileSortableHeader({
  active,
  direction,
  label,
  onSort,
  sortKey,
}: Omit<SortableHeaderProps, 'className'>) {
  const handleClick = useCallback(() => onSort(sortKey), [onSort, sortKey])

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      className={`flex min-w-0 items-center justify-center gap-1 border-gray-200 border-r px-2 py-3 font-sans text-xs last:border-r-0 ${
        active
          ? 'bg-white font-semibold text-gray-950'
          : 'text-gray-600 hover:text-gray-950'
      }`}
    >
      <span className="truncate">{label}</span>
      <span aria-hidden="true" className="shrink-0 font-mono text-gray-400">
        {active ? (direction === 'ascending' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  )
}

function MichelinCell({ restaurant }: { restaurant: StargazingRestaurant }) {
  const hasGreenStar = restaurant.distinction === 'Green Star'

  if (restaurant.stars === 0 && !hasGreenStar) {
    return (
      <span className="text-gray-700">
        {restaurant.distinction ?? 'Selected'}
      </span>
    )
  }

  const notes = [hasGreenStar ? undefined : restaurant.distinction].filter(
    Boolean
  )

  return (
    <span>
      <span className="flex items-center gap-2">
        {restaurant.stars > 0 ? (
          <span
            role="img"
            aria-label={starLabel(restaurant.stars)}
            className="inline-flex items-center gap-0.5 text-brass"
          >
            {STAR_POSITIONS.slice(0, restaurant.stars).map((position) => (
              <Star
                key={`${restaurant.name}-star-${position}`}
                aria-hidden="true"
                className="h-4 w-4 fill-current"
                strokeWidth={1.75}
              />
            ))}
          </span>
        ) : null}
        {hasGreenStar ? (
          <span
            role="img"
            aria-label="Michelin Green Star"
            tabIndex={0}
            className="group relative inline-flex cursor-help text-forest"
          >
            <Clover aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap border border-gray-700 bg-gray-950 px-2 py-1 font-mono text-[0.6875rem] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
            >
              Michelin Green Star
            </span>
          </span>
        ) : null}
      </span>
      {notes.length > 0 ? (
        <span className="mt-0.5 block text-gray-500 text-xs">
          {notes.join(' · ')}
        </span>
      ) : null}
    </span>
  )
}

function WorldsBestCell({ restaurant }: { restaurant: StargazingRestaurant }) {
  if (!restaurant.worldsBest) {
    return <span className="text-gray-400">Not ranked</span>
  }

  const numberOne = restaurant.worldsBest.numberOneWhileVisited

  return (
    <a
      href={restaurant.worldsBest.url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        numberOne
          ? 'inline-flex border border-indigo/30 bg-indigo/10 px-2 py-1 font-mono text-indigo text-xs no-underline transition-colors hover:border-indigo hover:bg-indigo/15'
          : 'underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-950 hover:decoration-gray-900'
      }
    >
      No. {restaurant.worldsBest.rank}
    </a>
  )
}

export function StargazingTable({ restaurants }: StargazingTableProps) {
  const searchId = useId()
  const resultsId = useId()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<StargazingSortKey>('name')
  const [direction, setDirection] = useState<SortDirection>('ascending')

  const visibleRestaurants = filterAndSortRestaurants(
    restaurants,
    query,
    sortKey,
    direction
  )

  const handleSort = useCallback(
    (nextKey: StargazingSortKey) => {
      if (nextKey === sortKey) {
        setDirection((current) =>
          current === 'ascending' ? 'descending' : 'ascending'
        )
        return
      }
      setSortKey(nextKey)
      setDirection(defaultSortDirection(nextKey))
    },
    [sortKey]
  )
  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    []
  )
  const clearQuery = useCallback(() => setQuery(''), [])

  return (
    <div>
      <div className="border-gray-300 border-y py-5">
        <div className="max-w-2xl">
          <label
            htmlFor={searchId}
            className="mb-2 block font-sans font-semibold text-gray-800 text-sm"
          >
            Search restaurants
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-gray-400"
            />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={handleQueryChange}
              placeholder="London or Noma"
              aria-controls={resultsId}
              className="h-11 w-full border border-gray-300 bg-white pr-20 pl-10 font-sans text-gray-950 text-sm placeholder:text-gray-400 pointer-coarse:text-base"
            />
            {query ? (
              <button
                type="button"
                onClick={clearQuery}
                className="-translate-y-1/2 absolute top-1/2 right-2 px-2 py-1 font-sans text-gray-500 text-xs hover:text-gray-950"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <p aria-live="polite" className="my-4 font-mono text-gray-500 text-xs">
        Showing {visibleRestaurants.length} of {restaurants.length} restaurants
      </p>

      <div id={resultsId}>
        {visibleRestaurants.length === 0 ? (
          <div className="border border-gray-200 bg-white px-5 py-14 text-center">
            <p className="font-serif text-gray-700 text-lg">
              No restaurants match “{query.trim()}”.
            </p>
            <button
              type="button"
              onClick={clearQuery}
              className="mt-4 border border-gray-300 bg-white px-4 py-2 font-sans text-gray-700 text-sm hover:border-gray-900 hover:text-gray-950"
            >
              Clear search
            </button>
          </div>
        ) : (
          <>
            <div className="hidden border border-gray-200 bg-white md:block">
              <table className="w-full table-fixed border-collapse">
                <thead className="bg-gray-050">
                  <tr>
                    <SortableHeader
                      active={sortKey === 'name'}
                      direction={direction}
                      label="Restaurant"
                      onSort={handleSort}
                      sortKey="name"
                      className="w-[27%]"
                    />
                    <SortableHeader
                      active={sortKey === 'city'}
                      direction={direction}
                      label="City"
                      onSort={handleSort}
                      sortKey="city"
                      className="w-[20%]"
                    />
                    <SortableHeader
                      active={sortKey === 'stars'}
                      direction={direction}
                      label="Michelin stars at my visit"
                      onSort={handleSort}
                      sortKey="stars"
                      className="w-[20%]"
                    />
                    <SortableHeader
                      active={sortKey === 'world'}
                      direction={direction}
                      label="World ranking at my visit"
                      onSort={handleSort}
                      sortKey="world"
                      className="w-[33%]"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleRestaurants.map((restaurant) => (
                    <tr
                      key={restaurant.name}
                      className={
                        restaurant.worldsBest?.numberOneWhileVisited
                          ? 'bg-indigo/5 transition-colors hover:bg-indigo/10'
                          : 'transition-colors hover:bg-gray-050'
                      }
                    >
                      <th
                        scope="row"
                        className={`px-4 py-4 text-left align-top font-sans font-semibold text-gray-950 text-sm ${
                          restaurant.worldsBest?.numberOneWhileVisited
                            ? 'border-indigo border-l-2'
                            : ''
                        }`}
                      >
                        {restaurant.name}
                      </th>
                      <td className="px-4 py-4 align-top font-sans text-gray-700 text-sm">
                        {restaurant.city}
                      </td>
                      <td className="px-4 py-4 align-top font-sans text-sm">
                        <MichelinCell restaurant={restaurant} />
                      </td>
                      <td className="px-4 py-4 align-top font-sans text-gray-700 text-sm">
                        <WorldsBestCell restaurant={restaurant} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden">
              <div
                role="group"
                aria-label="Sort restaurants"
                className="sticky top-0 z-10 grid grid-cols-4 border border-gray-200 bg-gray-050"
              >
                {MOBILE_SORT_OPTIONS.map((option) => (
                  <MobileSortableHeader
                    key={option.value}
                    active={sortKey === option.value}
                    direction={direction}
                    label={option.label}
                    onSort={handleSort}
                    sortKey={option.value}
                  />
                ))}
              </div>
              <ul className="divide-y divide-gray-200 border-gray-200 border-x border-b bg-white">
                {visibleRestaurants.map((restaurant) => (
                  <li
                    key={restaurant.name}
                    className={`px-4 py-5 ${
                      restaurant.worldsBest?.numberOneWhileVisited
                        ? 'border-indigo border-l-2 bg-indigo/5'
                        : ''
                    }`}
                  >
                    <h3 className="font-sans font-semibold text-gray-950 text-base">
                      {restaurant.name}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-sans text-gray-600 text-sm">
                      <span>{restaurant.city}</span>
                      <span aria-hidden="true" className="text-gray-300">
                        /
                      </span>
                      <MichelinCell restaurant={restaurant} />
                    </div>
                    {restaurant.worldsBest ? (
                      <p className="mt-3 font-sans text-gray-700 text-sm">
                        <span className="mr-2 font-mono text-gray-400 text-xs uppercase tracking-[0.06em]">
                          World
                        </span>
                        <WorldsBestCell restaurant={restaurant} />
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
