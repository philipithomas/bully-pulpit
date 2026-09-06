import Link from 'next/link'
import { getAllPosts, getPages } from '@/lib/content/loader'
import { publicContentPath } from '@/lib/content/public-path'
import type { Newsletter } from '@/lib/content/types'
import { publicAppPage, publicAppPages } from '@/lib/public-pages'
import { createPublicPageMetadata } from '@/lib/seo/metadata'

const sitemapPage = publicAppPage('/sitemap')

export const metadata = createPublicPageMetadata({
  path: '/sitemap',
  title: sitemapPage.title,
  description: sitemapPage.description,
})

const newsletterLabel: Record<Newsletter, string> = {
  contraption: 'Contraption',
  workshop: 'Workshop',
  postcard: 'Postcard',
  tidbits: 'Tidbits',
  tsundoku: 'Tsundoku',
}

// Tailwind utility classes for each newsletter accent. Uses the site color
// tokens defined in globals.css, with no duplicated hex values.
const newsletterColor: Record<Newsletter, string> = {
  contraption: 'text-forest',
  workshop: 'text-walnut',
  postcard: 'text-indigo',
  tidbits: 'text-tidbits-ink',
  tsundoku: 'text-sun',
}

export default function SitemapPage() {
  const posts = getAllPosts()

  const contentPages = getPages()
    .map((page) => ({
      href: publicContentPath(page.slug),
      title: page.frontmatter.title,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))

  const appPages = publicAppPages
    .filter((page) => page.humanSitemap)
    .map((page) => ({ href: page.path, title: page.title }))
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
        <p className="text-gray-600 leading-relaxed text-pretty mb-10">
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
                <li
                  key={page.href}
                  className="py-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <Link
                    href={page.href}
                    className="min-w-0 text-gray-900 hover:text-gray-950 transition-colors flex-1 leading-snug text-pretty"
                  >
                    {page.title}
                  </Link>
                  <span className="font-sans text-xs leading-relaxed text-gray-400 break-all sm:text-right">
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
                <h2 className="font-sans text-xl tabular-nums text-gray-950 mb-4">
                  {year}
                </h2>
                <ul className="divide-y divide-gray-100">
                  {yearPosts.map((post) => (
                    <li
                      key={post.slug}
                      className="py-3 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 sm:grid-cols-[6rem_minmax(0,1fr)_auto]"
                    >
                      <time
                        dateTime={post.frontmatter.publishedAt}
                        className="font-sans text-xs tabular-nums leading-relaxed text-gray-400"
                      >
                        {post.frontmatter.publishedAt}
                      </time>
                      <Link
                        href={publicContentPath(post.slug)}
                        className="col-span-2 row-start-2 min-w-0 text-gray-900 hover:text-gray-950 transition-colors leading-snug text-pretty sm:col-span-1 sm:row-start-auto"
                      >
                        {post.frontmatter.title}
                      </Link>
                      <span
                        className={`col-start-2 row-start-1 font-sans text-xs leading-relaxed sm:col-start-auto sm:row-start-auto ${newsletterColor[post.newsletter]}`}
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
