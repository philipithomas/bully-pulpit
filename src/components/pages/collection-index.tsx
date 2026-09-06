'use client'

import { Search, X } from 'lucide-react'
import {
  type ChangeEvent,
  useCallback,
  useDeferredValue,
  useId,
  useRef,
  useState,
} from 'react'
import {
  alphabeticalCollectionGroups,
  type CollectionDefinition,
  type CollectionEntry,
  collectionEntryAnchor,
  filterCollectionEntries,
} from '@/lib/collections/model'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function EntryTerm({ entry }: { entry: CollectionEntry }) {
  return entry.emphasis === 'italic' ? <em>{entry.term}</em> : entry.term
}

function CollectionEntryRow({ entry }: { entry: CollectionEntry }) {
  const anchor = collectionEntryAnchor(entry)

  return (
    <div
      id={anchor}
      className="scroll-mt-6 border-gray-200 border-t pt-4 first:border-t-0 first:pt-0"
    >
      <dt className="font-sans font-semibold text-gray-950 text-lg leading-snug tracking-tight">
        <a
          href={`#${anchor}`}
          className="group inline-flex items-baseline gap-2 no-underline"
        >
          <EntryTerm entry={entry} />
          <span
            aria-hidden="true"
            className="font-sans text-gray-300 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            #
          </span>
        </a>
      </dt>
      <dd className="mt-1 font-serif text-gray-700 text-base leading-relaxed sm:text-lg">
        {entry.definition}
        {entry.reference ? (
          <>
            {' '}
            <a
              href={entry.reference.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-950 hover:decoration-gray-900"
            >
              {entry.reference.label}
            </a>
          </>
        ) : null}
        {entry.suffix ? ` ${entry.suffix}` : null}
      </dd>
    </div>
  )
}

export function CollectionIndex({
  collection,
}: {
  collection: CollectionDefinition
}) {
  const inputId = useId()
  const resultsId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    []
  )
  const clearQuery = useCallback(() => {
    setQuery('')
    inputRef.current?.focus()
  }, [])
  const deferredQuery = useDeferredValue(query)
  const visibleEntries = filterCollectionEntries(
    collection.entries,
    deferredQuery
  )
  const groups = alphabeticalCollectionGroups(visibleEntries)
  const visibleLetters = new Set(groups.map((group) => group.letter))
  const filtering = deferredQuery.trim().length > 0
  const resultLabel = filtering
    ? `${visibleEntries.length} of ${collection.entries.length} entries`
    : `${collection.entries.length} entries`

  return (
    <div className="mt-10 md:mt-14">
      <div className="border-gray-300 border-y py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="w-full max-w-xl">
            <label
              htmlFor={inputId}
              className="font-sans font-semibold text-gray-800 text-sm"
            >
              Filter {collection.title}
            </label>
            <div className="relative mt-2">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500"
              />
              <input
                ref={inputRef}
                id={inputId}
                type="search"
                value={query}
                onChange={handleQueryChange}
                aria-describedby={resultsId}
                autoComplete="off"
                spellCheck={false}
                placeholder="Search words and definitions"
                className="w-full border border-gray-300 bg-white py-2.5 pr-10 pl-10 font-serif text-base text-gray-950 outline-none transition-colors placeholder:text-gray-400"
              />
              {query ? (
                <button
                  type="button"
                  onClick={clearQuery}
                  aria-label="Clear filter"
                  className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center text-gray-500 transition-colors hover:text-gray-950"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </div>
          </div>

          <p
            id={resultsId}
            aria-live="polite"
            aria-atomic="true"
            className="shrink-0 font-sans text-gray-500 text-xs tabular-nums"
          >
            {resultLabel}
          </p>
        </div>

        <nav
          aria-label={`${collection.title} alphabetical index`}
          className="mt-5 flex flex-wrap gap-x-1 gap-y-2"
        >
          {ALPHABET.map((letter) =>
            visibleLetters.has(letter) ? (
              <a
                key={letter}
                href={`#letter-${letter.toLocaleLowerCase('en-US')}`}
                className="flex size-7 items-center justify-center font-sans font-medium text-gray-700 text-xs no-underline transition-colors hover:bg-gray-900 hover:text-white"
              >
                {letter}
              </a>
            ) : (
              <span
                key={letter}
                aria-hidden="true"
                className="flex size-7 items-center justify-center font-sans text-gray-300 text-xs"
              >
                {letter}
              </span>
            )
          )}
        </nav>
      </div>

      {groups.length > 0 ? (
        <div className="mt-10 space-y-12 md:mt-14 md:space-y-16">
          {groups.map((group) => (
            <section
              key={group.letter}
              aria-labelledby={`letter-${group.letter.toLocaleLowerCase('en-US')}`}
              className="grid gap-5 md:grid-cols-[4rem_minmax(0,1fr)] md:gap-8"
            >
              <h2
                id={`letter-${group.letter.toLocaleLowerCase('en-US')}`}
                className="scroll-mt-6 font-sans font-semibold text-2xl text-brass md:text-3xl"
              >
                {group.letter}
              </h2>
              <dl className="grid min-w-0 gap-x-12 gap-y-6 lg:grid-cols-2">
                {group.entries.map((entry) => (
                  <CollectionEntryRow
                    key={collectionEntryAnchor(entry)}
                    entry={entry}
                  />
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : (
        <p className="py-20 text-center font-serif text-gray-600 text-lg">
          No entries match “{deferredQuery.trim()}.”
        </p>
      )}
    </div>
  )
}
