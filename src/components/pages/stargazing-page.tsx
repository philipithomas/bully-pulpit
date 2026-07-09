import { SetNewsletter } from '@/components/layout/newsletter-context'
import { StargazingTable } from '@/components/pages/stargazing-table'
import { JsonLd } from '@/components/seo/json-ld'
import type { Page } from '@/lib/content/types'
import {
  stargazingRestaurants,
  stargazingStats,
} from '@/lib/stargazing/restaurants'

const MICHELIN_GUIDE_URL = 'https://guide.michelin.com/en/restaurants'
const WORLDS_BEST_URL =
  'https://www.theworlds50best.com/restaurants/best-in-the-world/previous-list/'

const countingRules = [
  'I count each restaurant once, no matter how often I return.',
  'Michelin stars reflect the rating at the time I visited, with some grace for nearby promotions and places the Guide reached later.',
  'World rankings reflect the list at the time I visited. Visit dates stay private.',
  'I also keep Green Stars and selected restaurants here. I include a Bib Gourmand only when it also appeared in The World’s 50 Best.',
]

export function StargazingPage({ page }: { page: Page }) {
  return (
    <article className="bg-gray-050" data-bg="gray-050">
      <SetNewsletter newsletter={null} />
      <JsonLd type="webpage" page={page} />

      <div className="container py-12 md:py-16 lg:py-20">
        <header className="max-w-4xl">
          <h1 className="font-sans font-semibold text-4xl text-gray-950 tracking-tight sm:text-5xl lg:text-7xl">
            {page.frontmatter.title}
          </h1>
          <p className="mt-6 max-w-2xl font-serif text-gray-700 text-xl leading-relaxed sm:text-2xl">
            I enjoy fine dining as a lens to explore local culture and
            craftspeople performing at the highest level.
          </p>
        </header>

        <p className="my-10 max-w-4xl border-gray-300 border-y py-8 font-serif text-2xl text-gray-950 leading-snug sm:text-3xl md:my-14 md:py-10 md:text-4xl">
          I have eaten at{' '}
          <span className="font-mono font-semibold text-forest tabular-nums">
            {stargazingStats.starredRestaurants}
          </span>{' '}
          Michelin-starred restaurants, totaling{' '}
          <span className="font-mono font-semibold text-walnut tabular-nums">
            {stargazingStats.stars}
          </span>{' '}
          stars.{' '}
          <span className="font-mono font-semibold text-indigo tabular-nums">
            {stargazingStats.numberOneRestaurants}
          </span>{' '}
          were ranked No. 1 in the world when I visited.
        </p>

        <section className="grid gap-7 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-12">
          <div>
            <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight">
              How I count
            </h2>
            <p className="mt-2 font-mono text-gray-500 text-xs">
              {stargazingStats.restaurants} restaurants, one line each
            </p>
          </div>
          <div className="max-w-3xl">
            <ol className="space-y-5">
              {countingRules.map((rule, index) => (
                <li key={rule} className="flex gap-4">
                  <span className="mt-1 shrink-0 font-mono text-brass text-xs">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p className="font-serif text-gray-700 text-lg leading-relaxed">
                    {rule}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-7 font-sans text-gray-500 text-sm">
              Browse the{' '}
              <a
                href={MICHELIN_GUIDE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-gray-300 underline-offset-2 hover:text-gray-950 hover:decoration-gray-900"
              >
                Michelin Guide
              </a>{' '}
              and{' '}
              <a
                href={WORLDS_BEST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-gray-300 underline-offset-2 hover:text-gray-950 hover:decoration-gray-900"
              >
                World’s 50 Best archives
              </a>
              .
            </p>
          </div>
        </section>

        {/* biome-ignore lint/correctness/useUniqueElementIds: stable search-result anchor */}
        <div id="restaurants" className="mt-14 scroll-mt-14 md:mt-20">
          <StargazingTable restaurants={stargazingRestaurants} />
        </div>
      </div>
    </article>
  )
}
