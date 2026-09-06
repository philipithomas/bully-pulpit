'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react'
import styles from '@/components/home/home-cabinet.module.css'
import { zoomImageDataAttrs } from '@/lib/content/zoom-image'
import type { HomeCuriosity, HomeDrawer } from '@/lib/home/types'

const TABS = [
  { key: 'photographs', label: 'Photographs' },
  { key: 'words', label: 'Words' },
  { key: 'contraptions', label: 'Contraptions' },
  { key: 'writing', label: 'Writing' },
] as const
type CabinetTab = (typeof TABS)[number]['key']

function Curiosity({
  item,
  label,
  collection,
}: {
  item: HomeCuriosity | null
  label: string
  collection: string
}) {
  return (
    <div className={styles.paper}>
      <p className={styles.eyebrow}>{label}</p>
      {item ? (
        <>
          <h3 className={styles.term}>{item.title}</h3>
          <p className={styles.definition}>{item.description}</p>
          <Link href={item.href} className={styles.paperLink}>
            In {collection} <span aria-hidden="true">↗</span>
          </Link>
        </>
      ) : (
        <p className={styles.definition}>Something to add to the collection.</p>
      )}
    </div>
  )
}

export function HomeCabinet({ drawer }: { drawer: HomeDrawer }) {
  const [activeTab, setActiveTab] = useState<CabinetTab>('photographs')
  const [photoIndex, setPhotoIndex] = useState(0)
  const id = useId()
  const tabListRef = useRef<HTMLDivElement>(null)
  const photo = drawer.photos[photoIndex]
  const displayDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${drawer.date}T12:00:00Z`))

  const handleTabClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const tab = TABS.find(
      (item) => item.key === event.currentTarget.dataset.tab
    )
    if (tab) setActiveTab(tab.key)
  }, [])

  const handleTabKey = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const index = TABS.findIndex(
        (item) => item.key === event.currentTarget.dataset.tab
      )
      let next = index
      if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
      else if (event.key === 'ArrowLeft')
        next = (index + TABS.length - 1) % TABS.length
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = TABS.length - 1
      else return
      event.preventDefault()
      setActiveTab(TABS[next].key)
      tabListRef.current
        ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        [next]?.focus()
    },
    []
  )

  const showNextPhoto = useCallback(() => {
    setPhotoIndex((index) => (index + 1) % drawer.photos.length)
  }, [drawer.photos.length])

  return (
    <section className={styles.cabinet} aria-labelledby={`${id}-heading`}>
      <div className={styles.cabinetHeading}>
        <h2 id={`${id}-heading`}>The drawer</h2>
        <time dateTime={drawer.date}>{displayDate}</time>
      </div>
      <div
        ref={tabListRef}
        className={styles.tabs}
        role="tablist"
        aria-label="Open a drawer"
      >
        {TABS.map((tab, index) => (
          <button
            key={tab.key}
            data-tab={tab.key}
            id={`${id}-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`${id}-panel-${tab.key}`}
            tabIndex={activeTab === tab.key ? 0 : -1}
            onClick={handleTabClick}
            onKeyDown={handleTabKey}
          >
            <span className={styles.tabNumber} aria-hidden="true">
              0{index + 1}
            </span>
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel-photographs`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-photographs`}
        hidden={activeTab !== 'photographs'}
        tabIndex={0}
        className={styles.panel}
      >
        {photo ? (
          <figure className={styles.photograph}>
            <button
              type="button"
              className={styles.photoStage}
              aria-label={`Enlarge ${photo.title}`}
              data-zoomable=""
              data-zoom-caption-title={photo.title}
              {...zoomImageDataAttrs({
                src: photo.src,
                dimensions: { width: photo.width, height: photo.height },
              })}
            >
              <Image
                key={photo.src}
                src={photo.src}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1023px) 80vw, 60vw"
                priority={photoIndex === 0}
                className={styles.photo}
              />
            </button>
            <figcaption
              className={styles.caption}
              aria-live="polite"
              aria-atomic="true"
            >
              <div>
                <Link href={photo.href}>
                  {photo.title} <span aria-hidden="true">↗</span>
                </Link>
                <p>{photo.location ?? photo.newsletter}</p>
              </div>
              {drawer.photos.length > 1 ? (
                <button
                  type="button"
                  className={styles.another}
                  onClick={showNextPhoto}
                >
                  Another photograph <span aria-hidden="true">↻</span>
                </button>
              ) : null}
            </figcaption>
          </figure>
        ) : (
          <div className={styles.paper}>
            <Link href="/tidbits" className={styles.paperLink}>
              Visit the photo journal ↗
            </Link>
          </div>
        )}
      </div>
      <div
        id={`${id}-panel-words`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-words`}
        hidden={activeTab !== 'words'}
        tabIndex={0}
        className={styles.panel}
      >
        <Curiosity
          item={drawer.word}
          label="A word for today"
          collection="Diction"
        />
      </div>
      <div
        id={`${id}-panel-contraptions`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-contraptions`}
        hidden={activeTab !== 'contraptions'}
        tabIndex={0}
        className={styles.panel}
      >
        <Curiosity
          item={drawer.contraption}
          label="An object of interest"
          collection="Contraptions"
        />
      </div>
      <div
        id={`${id}-panel-writing`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-writing`}
        hidden={activeTab !== 'writing'}
        tabIndex={0}
        className={styles.panel}
      >
        <div className={`${styles.paper} ${styles.writing}`}>
          {drawer.writing ? (
            <>
              <p className={styles.eyebrow}>{drawer.writing.label}</p>
              <h3 className={styles.essayTitle}>{drawer.writing.title}</h3>
              <p className={styles.definition}>{drawer.writing.description}</p>
              <Link href={drawer.writing.href} className={styles.paperLink}>
                Read the piece <span aria-hidden="true">↗</span>
              </Link>
            </>
          ) : (
            <Link href="/contraption" className={styles.paperLink}>
              Browse the writing ↗
            </Link>
          )}
        </div>
      </div>
      <noscript>
        <p className={styles.noScript}>
          Browse the <Link href="/tidbits">photo journal</Link>,{' '}
          <Link href="/diction">words</Link>,{' '}
          <Link href="/contraptions">contraptions</Link>, or{' '}
          <Link href="/contraption">writing</Link>.
        </p>
      </noscript>
    </section>
  )
}
