'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import styles from '@/app/home.module.css'
import type { HomePhoto } from '@/lib/home/types'

export function HomePhotograph({ photos }: { photos: HomePhoto[] }) {
  const [index, setIndex] = useState(0)
  const nextPhoto = useCallback(
    () => setIndex((current) => (current + 1) % photos.length),
    [photos.length]
  )
  const photo = photos[index] ?? photos[0]
  if (!photo) return null

  return (
    <figure className={styles.photograph}>
      <Link
        href={photo.href}
        prefetch={false}
        className={styles.imageLink}
        aria-label={`View ${photo.title}`}
      >
        <Image
          key={photo.src}
          src={photo.src}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          sizes="(min-width: 1280px) 720px, (min-width: 768px) 60vw, calc(100vw - 32px)"
          priority={index === 0}
          className={styles.image}
        />
      </Link>
      <figcaption className={styles.caption}>
        <div aria-live="polite" aria-atomic="true">
          <Link href={photo.href} prefetch={false}>
            {photo.title}
          </Link>
          <span>
            {index === 0 ? 'Latest photograph' : 'From the photo journal'}
            {photo.location ? ` · ${photo.location}` : ''}
          </span>
        </div>
        {photos.length > 1 ? (
          <button type="button" onClick={nextPhoto}>
            Another photograph <span aria-hidden="true">↻</span>
          </button>
        ) : null}
      </figcaption>
      <Link href="/tidbits" className={styles.photoArchive}>
        The photo journal <span aria-hidden="true">↗</span>
      </Link>
    </figure>
  )
}
