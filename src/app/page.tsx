import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '@/app/home.module.css'
import { InlineSignupForm } from '@/components/auth/inline-signup-form'
import { HomePhotograph } from '@/components/home/home-photograph'
import { LatestPostPill } from '@/components/posts/latest-post-pill'
import { JsonLd } from '@/components/seo/json-ld'
import { NewsletterWordmark } from '@/components/tidbits/newsletter-wordmark'
import { siteConfig } from '@/lib/config'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { getHomeDrawer } from '@/lib/home/drawer'
import { sitePhoneDisplayNumber, sitePhoneNumber } from '@/lib/phone/config'

export const metadata: Metadata = {
  alternates: { canonical: '/', types: feedDiscovery() },
}

// Cached HTML includes the daily selection. No browser clock, content fetch,
// database query, or model call is needed to open the drawer.
export const revalidate = 3600

export default function HomePage() {
  const drawer = getHomeDrawer()
  const date = new Date(`${drawer.date}T12:00:00Z`).toLocaleDateString(
    'en-US',
    {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }
  )
  return (
    <div className={`container ${styles.home}`}>
      <JsonLd type="website" />
      <div className={styles.introduction}>
        <div>
          <LatestPostPill />
          <h1>
            Tools, photographs,
            <br />
            and other curiosities.
          </h1>
        </div>
        <p className={styles.bio}>
          I am an engineer living in New York, working at the intersection of
          math, software, and business. I am interested in urbanism, coffee, and
          photography.
        </p>
      </div>
      {/* biome-ignore lint/correctness/useUniqueElementIds: homepage has one permanent drawer anchor */}
      <section
        id="drawer"
        aria-label="From the drawer"
        className={styles.drawer}
      >
        <div className={styles.sectionHeading}>
          <h2>From the drawer</h2>
          <time dateTime={drawer.date}>{date}</time>
        </div>
        <div className={styles.discoveries}>
          <HomePhotograph photos={drawer.photos} />
          <div className={styles.marginalia}>
            {drawer.word ? (
              <article>
                <p className={styles.eyebrow}>A word for today</p>
                <h3>
                  <Link href={drawer.word.href}>{drawer.word.title}</Link>
                </h3>
                <p className={styles.definition}>{drawer.word.description}</p>
                <Link className={styles.smallLink} href="/diction">
                  More diction <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ) : null}
            {drawer.contraption ? (
              <article>
                <p className={styles.eyebrow}>A contraption for today</p>
                <h3>
                  <Link href={drawer.contraption.href}>
                    {drawer.contraption.title}
                  </Link>
                </h3>
                <p className={styles.definition}>
                  {drawer.contraption.description}
                </p>
                <Link className={styles.smallLink} href="/contraptions">
                  More contraptions <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ) : null}
            {drawer.writing ? (
              <article className={styles.archive}>
                <p className={styles.eyebrow}>{drawer.writing.label}</p>
                <h3>
                  <Link href={drawer.writing.href}>
                    {drawer.writing.title} <span aria-hidden="true">↗</span>
                  </Link>
                </h3>
              </article>
            ) : null}
          </div>
        </div>
      </section>
      <section className={styles.letters} aria-label="Keep in touch">
        <div>
          <h2>Keep in touch.</h2>
          <p>New writing and photographs, delivered by email.</p>
          <div className={styles.wordmarks}>
            {(['postcard', 'contraption', 'tidbits'] as const).map((slug) => {
              const newsletter = siteConfig.newsletters[slug]
              return (
                <Link key={slug} href={`/${slug}`}>
                  <NewsletterWordmark
                    src={newsletter.logo.src}
                    alt={newsletter.name}
                    width={newsletter.logo.intrinsicWidth}
                    height={newsletter.logo.intrinsicHeight}
                    style={{
                      height: slug === 'tidbits' ? 13 : 15,
                      width: 'auto',
                    }}
                  />
                </Link>
              )
            })}
          </div>
        </div>
        <div className={styles.signup}>
          <InlineSignupForm
            hideWhenLoggedIn
            analyticsPlacement="homepage"
            smsSignupPhoneNumber={sitePhoneNumber()}
            smsSignupDisplayNumber={sitePhoneDisplayNumber()}
          />
          <p className={styles.smallLink}>
            Or follow along via <Link href="/feed/rss.xml">RSS</Link>.
          </p>
        </div>
      </section>
    </div>
  )
}
