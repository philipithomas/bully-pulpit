'use client'

import Link from 'next/link'
import { useState } from 'react'
import styles from '@/app/home-gallery.module.css'

interface Discovery {
  label: string
  tab: string
  title: string
  description: string
  href: string
}

export function DailyDrawer({
  date,
  items,
}: {
  date: string
  items: Discovery[]
}) {
  const [selected, setSelected] = useState(0)
  const item = items[selected]

  if (!item) return null

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))

  return (
    <section className={styles.drawer} aria-label="From the drawer">
      <div className={styles.drawerHeading}>
        <h2>From the drawer</h2>
        <time dateTime={date}>{formattedDate}</time>
      </div>
      <div
        className={styles.drawerChoices}
        role="group"
        aria-label="Choose a discovery"
      >
        {items.map((entry, index) => (
          <button
            key={entry.tab}
            type="button"
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            {entry.tab}
          </button>
        ))}
      </div>
      <div className={styles.discovery} aria-live="polite" aria-atomic="true">
        <p
          className={
            item.tab === 'Archive' ? styles.archiveLabel : styles.discoveryLabel
          }
        >
          {item.label}
        </p>
        <h3>
          <Link href={item.href} prefetch={false}>
            {item.title} <span aria-hidden="true">↗</span>
          </Link>
        </h3>
        <p className={styles.definition}>{item.description}</p>
      </div>
    </section>
  )
}
