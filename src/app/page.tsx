import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '@/app/home-gallery.module.css'
import { DailyDrawer } from '@/components/home/daily-drawer'
import { PhotographStudy } from '@/components/home/photograph-study'
import { LatestPostPill } from '@/components/posts/latest-post-pill'
import { JsonLd } from '@/components/seo/json-ld'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { getHomeDrawer } from '@/lib/home/drawer'

// The daily selection is assembled from local content during static
// generation. ISR refreshes it without a browser request or model call.
export const revalidate = 3600

export const metadata: Metadata = {
  alternates: { canonical: '/', types: feedDiscovery() },
}

export default function HomePage() {
  const drawer = getHomeDrawer()
  const discoveries = [
    drawer.word && { ...drawer.word, label: 'Word of the day', tab: 'Word' },
    drawer.contraption && {
      ...drawer.contraption,
      label: 'Contraption of the day',
      tab: 'Contraption',
    },
    drawer.writing && { ...drawer.writing, tab: 'Archive' },
  ].filter((item) => item !== null)

  return (
    <div className={styles.home} data-home-gallery="">
      <JsonLd type="website" />
      <div className={styles.study}>
        <div className={styles.introduction}>
          <div className={styles.newWriting}>
            <LatestPostPill />
          </div>
          <h1>Crafting digital tools</h1>
          <p>
            I am an engineer in New York, interested in cities, coffee, and
            photography.
          </p>
        </div>

        <PhotographStudy photos={drawer.photos} />

        <DailyDrawer date={drawer.date} items={discoveries} />
      </div>

      <div className={styles.colophon}>
        <nav
          aria-label="Writing and photography"
          className={styles.collections}
        >
          <Link href="/contraption" prefetch={false}>
            Contraption
          </Link>
          <Link href="/postcard" prefetch={false}>
            Postcard
          </Link>
          <Link href="/photography" prefetch={false}>
            Photographs
          </Link>
        </nav>
        <nav aria-label="Site information" className={styles.information}>
          <Link href="/contact" prefetch={false}>
            Contact
          </Link>
          <Link href="/feed/rss.xml" prefetch={false}>
            RSS
          </Link>
          <Link href="/colophon" prefetch={false}>
            Colophon
          </Link>
          <Link href="/sitemap" prefetch={false}>
            Index
          </Link>
          <Link href="/privacy" prefetch={false}>
            Privacy
          </Link>
          <Link href="/terms" prefetch={false}>
            Terms
          </Link>
        </nav>
      </div>
    </div>
  )
}
