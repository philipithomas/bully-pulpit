import { Search } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { hybridSearchPosts, type SearchScope } from '@/lib/search/hybrid'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search posts and photographs on philipithomas.com.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/search', types: feedDiscovery() },
}

type SearchPageProps = {
  searchParams: Promise<{
    q?: string | string[]
    query?: string | string[]
    scope?: string | string[]
  }>
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function resultTypeLabel(scope: SearchScope): string {
  return scope === 'images' ? 'photos' : 'posts'
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams
  const query = (firstParam(params.query) || firstParam(params.q)).trim()
  const scope: SearchScope =
    firstParam(params.scope) === 'images' ? 'images' : 'posts'
  const hasSearch = query.length >= 2
  const search = hasSearch
    ? await hybridSearchPosts(query, {
        scope,
        maxImages: scope === 'images' ? 1 : 3,
      })
    : null
  const results = search?.results ?? []

  return (
    <main className="container py-10 md:py-14">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-sans text-4xl font-semibold tracking-tight text-gray-950">
          Search
        </h1>
        <p className="mt-3 max-w-2xl font-serif text-gray-600 text-lg leading-relaxed">
          Search posts and photographs from the archive by subject, title, or
          phrase.
        </p>

        <form action="/search" className="mt-7 flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-0 flex-1 items-center border border-gray-300 bg-white px-3">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              type="search"
              name="query"
              defaultValue={query}
              placeholder="Software, coffee, trains"
              aria-label="Search query"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-sans text-sm text-gray-950 placeholder:text-gray-400 pointer-coarse:text-base"
            />
          </label>
          <select
            name="scope"
            defaultValue={scope}
            aria-label="Search scope"
            className="border border-gray-300 bg-white px-3 py-2.5 font-sans text-sm text-gray-950 pointer-coarse:text-base"
          >
            <option value="posts">Posts</option>
            <option value="images">Photos</option>
          </select>
          <button type="submit" className="btn btn-primary">
            <span className="btn-text">Search</span>
          </button>
        </form>

        {query.length > 0 && query.length < 2 ? (
          <p className="mt-6 font-sans text-sm text-gray-500">
            Search needs at least two characters.
          </p>
        ) : null}

        {hasSearch ? (
          <div className="mt-9">
            <p className="font-sans text-sm text-gray-500">
              {results.length === 0
                ? `No ${resultTypeLabel(scope)} found for "${query}".`
                : `${results.length} ${resultTypeLabel(scope)} found for "${query}".`}
            </p>

            {results.length > 0 ? (
              <ol className="mt-5 divide-y divide-gray-100 border-y border-gray-100">
                {results.map((result) => {
                  const image = result.image ?? result.images[0]
                  const thumbnail = image?.src ?? result.coverImage
                  const snippet =
                    image?.description ?? result.excerpts[0]?.text ?? ''
                  return (
                    <li key={result.id}>
                      <Link
                        href={result.url}
                        className="group flex gap-4 py-4 transition-colors hover:bg-gray-050"
                      >
                        {thumbnail ? (
                          <Image
                            src={thumbnail}
                            alt=""
                            width={96}
                            height={72}
                            className="h-[72px] w-24 shrink-0 object-cover"
                          />
                        ) : null}
                        <span className="min-w-0">
                          <span className="block font-sans font-semibold text-gray-950 text-base transition-colors group-hover:text-forest">
                            {result.title}
                          </span>
                          <span className="mt-1 block font-sans text-gray-500 text-xs capitalize">
                            {result.newsletter}
                          </span>
                          {snippet ? (
                            <span className="mt-1.5 line-clamp-2 block font-serif text-gray-600 text-sm leading-relaxed">
                              {snippet}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  )
}
