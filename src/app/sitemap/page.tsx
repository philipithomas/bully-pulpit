import type { Metadata } from 'next'
import Link from 'next/link'
import { siteConfig } from '@/lib/config'
import { getAllPosts, getPages } from '@/lib/content/loader'
import type { Newsletter } from '@/lib/content/types'
import { feedDiscovery } from '@/lib/feeds/discovery'

export const metadata: Metadata = {
  title: 'Sitemap',
  description: `A sitemap for humans: every page and post by ${siteConfig.author}.`,
  // Page-level alternates replace the root layout's, so restate the feeds.
  alternates: { canonical: '/sitemap', types: feedDiscovery() },
}

const newsletterLabel: Record<Newsletter, string> = {
  contraption: 'Contraption',
  workshop: 'Workshop',
  postcard: 'Postcard',
  tsundoku: 'Tsundoku',
}

// Tailwind utility classes for each newsletter accent. Uses the site color
// tokens (forest / walnut / indigo) defined in globals.css — no hex values.
const newsletterColor: Record<Newsletter, string> = {
  contraption: 'text-forest',
  workshop: 'text-walnut',
  postcard: 'text-indigo',
  tsundoku: 'text-rising-sun',
}

// App Router pages that do not come from content/pages.
const appPages: { href: string; title: string }[] = [
  { href: '/', title: 'Home' },
  { href: '/contraption', title: 'Contraption' },
  { href: '/workshop', title: 'Workshop' },
  { href: '/postcard', title: 'Postcard' },
  { href: '/tsundoku', title: 'Tsundoku' },
  { href: '/photography', title: 'Photography' },
  { href: '/print', title: 'Print edition' },
]

export default function SitemapPage() {
  const posts = getAllPosts()

  const contentPages = getPages()
    .map((page) => ({
      href: `/${page.slug}`,
      title: page.frontmatter.title,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))

  const pages = [...appPages, ...contentPages]

  // Group posts by year, descending
  const byYear = new Map<number, typeof posts>()
  for (const post of posts) {
    const year = Number.parseInt(post.frontmatter.publishedAt.slice(0, 4), 10)
    const arr = byYear.get(year) ?? []
    arr.push(post)
    byYear.set(year, arr)
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a)

  return (
    <div className="bg-gray-050" data-bg="gray-050">
      <div className="container py-12 md:py-16">
        <h1 className="font-semibold text-2xl sm:text-3xl tracking-tight text-gray-950 mb-4">
          Sitemap
        </h1>
        <p className="text-gray-600 leading-snug mb-10">
          This is a sitemap for humans. There is also a{' '}
          <a
            href="/sitemap.xml"
            className="underline underline-offset-2 hover:text-gray-950 transition-colors"
          >
            sitemap for robots
          </a>
          .
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="font-serif text-xl text-gray-950 mb-4">Pages</h2>
            <ul className="divide-y divide-gray-100">
              {pages.map((page) => (
                <li key={page.href} className="py-3 flex items-baseline gap-4">
                  <Link
                    href={page.href}
                    className="text-gray-900 hover:text-gray-950 transition-colors flex-1 leading-snug"
                  >
                    {page.title}
                  </Link>
                  <span className="font-mono text-xs text-gray-400 shrink-0">
                    {page.href}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {years.map((year) => {
            const yearPosts = byYear.get(year) ?? []
            return (
              <section key={year}>
                <h2 className="font-serif text-xl text-gray-950 mb-4">
                  {year}
                </h2>
                <ul className="divide-y divide-gray-100">
                  {yearPosts.map((post) => (
                    <li
                      key={post.slug}
                      className="py-3 flex items-baseline gap-4"
                    >
                      <time
                        dateTime={post.frontmatter.publishedAt}
                        className="font-mono text-xs text-gray-400 shrink-0 w-24"
                      >
                        {post.frontmatter.publishedAt}
                      </time>
                      <Link
                        href={`/${post.slug}`}
                        className="text-gray-900 hover:text-gray-950 transition-colors flex-1 leading-snug"
                      >
                        {post.frontmatter.title}
                      </Link>
                      <span
                        className={`font-mono text-xs shrink-0 ${newsletterColor[post.newsletter]}`}
                      >
                        {newsletterLabel[post.newsletter]}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
