import type { Metadata } from 'next'
import Link from 'next/link'
import { HomeCabinet } from '@/components/home/home-cabinet'
import styles from '@/components/home/home-cabinet.module.css'
import { LatestPostPill } from '@/components/posts/latest-post-pill'
import { JsonLd } from '@/components/seo/json-ld'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { getHomeDrawer } from '@/lib/home/drawer'

export const metadata: Metadata = {
  alternates: { canonical: '/', types: feedDiscovery() },
}

// Refresh the daily contents through cached server rendering.
export const revalidate = 3600

export default function HomePage() {
  return (
    <div className={`container ${styles.page}`} data-home-cabinet="">
      <JsonLd type="website" />
      <div className={styles.desk}>
        <div className={styles.introduction}>
          <p className={styles.eyebrow}>From New York, with curiosity.</p>
          <h1 className={styles.title}>
            Crafting
            <br />
            digital tools
          </h1>
          <p className={styles.bio}>
            I&rsquo;m an engineer in New York, working at the intersection of
            math, software, and business. Usually thinking about cities, coffee,
            or the next photograph.
          </p>
          <div className={styles.latest}>
            <LatestPostPill />
          </div>
        </div>
        <HomeCabinet drawer={getHomeDrawer()} />
        <div className={styles.notes}>
          <nav className={styles.correspondence} aria-label="Newsletters">
            <p className={styles.eyebrow}>Notes from me</p>
            <Link href="/postcard">
              <span>Postcard</span>
              <span>A monthly letter</span>
            </Link>
            <Link href="/contraption">
              <span>Contraption</span>
              <span>Things I&rsquo;m making</span>
            </Link>
            <Link href="/tidbits">
              <span>Tidbits</span>
              <span>A photo journal</span>
            </Link>
          </nav>
          <Link href="/contact" className={styles.contact}>
            Say hello <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
      <div className={styles.bottomLine}>
        <p>A small collection. Something different each day.</p>
        <nav aria-label="Browse the collections">
          <Link href="/diction">Diction</Link>
          <Link href="/contraptions">Contraptions</Link>
          <Link href="/tidbits">Photo journal</Link>
          <Link href="/feed/rss.xml">RSS</Link>
        </nav>
      </div>
    </div>
  )
}
