import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'

export const metadata: Metadata = {
  title: 'Postcard',
  description: siteConfig.newsletters.postcard.tagline,
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export default function PostcardPage() {
  const posts = getPostsByNewsletter('postcard')

  // Build calendar grid: group posts by YYYY-MM key
  // Parse publishedAt as a plain string to avoid timezone off-by-1
  const postsByMonth = new Map<string, (typeof posts)[0]>()
  for (const post of posts) {
    // publishedAt is "YYYY-MM-DD" — take first 7 chars for "YYYY-MM"
    const key = post.frontmatter.publishedAt.slice(0, 7)
    postsByMonth.set(key, post)
  }

  // Generate all months from earliest post to now
  const months: { key: string; label: string; year: number }[] = []
  if (posts.length > 0) {
    const earliestKey = posts[posts.length - 1].frontmatter.publishedAt.slice(
      0,
      7
    )
    const startYear = Number.parseInt(earliestKey.slice(0, 4), 10)
    const startMonth = Number.parseInt(earliestKey.slice(5, 7), 10) - 1

    const now = new Date()
    const endYear = now.getFullYear()
    const endMonth = now.getMonth()

    let y = startYear
    let m = startMonth
    while (y < endYear || (y === endYear && m <= endMonth)) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`
      months.push({ key, label: MONTH_LABELS[m], year: y })
      m++
      if (m > 11) {
        m = 0
        y++
      }
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
    <div className="bg-offwhite-cool min-h-screen" data-bg="offwhite-cool">
      <div className="container py-12 md:py-16">
        <div className="mb-12 flex flex-col items-center text-center">
          <Image
            src="/images/postcard.svg"
            alt="Postcard"
            width={200}
            height={48}
            className="h-10 md:h-12 w-auto mx-auto"
            priority
          />
          <h1 className="sr-only">Postcard</h1>
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
