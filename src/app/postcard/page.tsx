import type { Metadata } from 'next'
import Link from 'next/link'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'

export const metadata: Metadata = {
  title: 'Postcard',
  description: siteConfig.newsletters.postcard.tagline,
}

export default function PostcardPage() {
  const posts = getPostsByNewsletter('postcard')

  // Build calendar grid: group posts by year and month
  const postsByMonth = new Map<string, (typeof posts)[0]>()
  for (const post of posts) {
    const date = new Date(post.frontmatter.publishedAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    postsByMonth.set(key, post)
  }

  // Generate all months from earliest post to now
  const months: { key: string; label: string; year: number }[] = []
  if (posts.length > 0) {
    const earliest = new Date(posts[posts.length - 1].frontmatter.publishedAt)
    const now = new Date()
    const current = new Date(earliest.getFullYear(), earliest.getMonth(), 1)
    while (current <= now) {
      const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
      months.push({
        key,
        label: current.toLocaleDateString('en-US', {
          month: 'short',
        }),
        year: current.getFullYear(),
      })
      current.setMonth(current.getMonth() + 1)
    }
  }

  // Group months by year
  const years = new Map<number, typeof months>()
  for (const m of months) {
    const arr = years.get(m.year) ?? []
    arr.push(m)
    years.set(m.year, arr)
  }

  return (
    <div className="bg-offwhite-cool min-h-screen">
      <div className="container py-12 md:py-16">
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-gray-950">
            Postcard
          </h1>
          <p className="font-serif text-lg text-gray-600 mt-3">
            {siteConfig.newsletters.postcard.tagline}
          </p>
        </div>

        <div className="space-y-8">
          {Array.from(years.entries())
            .sort(([a], [b]) => b - a)
            .map(([year, yearMonths]) => (
              <div key={year}>
                <h2 className="font-mono text-xs font-semibold tracking-[0.15em] uppercase text-gray-500 mb-4">
                  {year}
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                  {yearMonths.map((m) => {
                    const post = postsByMonth.get(m.key)
                    return post ? (
                      <Link
                        key={m.key}
                        href={`/${post.slug}`}
                        className="flex flex-col items-center justify-center p-3 bg-indigo text-white rounded-sm hover:bg-indigo/90 transition-colors text-center"
                      >
                        <span className="font-mono text-xs font-semibold">
                          {m.label}
                        </span>
                      </Link>
                    ) : (
                      <div
                        key={m.key}
                        className="flex flex-col items-center justify-center p-3 bg-gray-100 text-gray-400 rounded-sm text-center"
                      >
                        <span className="font-mono text-xs">{m.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
