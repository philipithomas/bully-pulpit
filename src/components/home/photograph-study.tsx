'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import styles from '@/app/home-gallery.module.css'
import type { HomePhoto } from '@/lib/home/types'

function imageSizes(photo: HomePhoto) {
  const ratio = photo.width / photo.height
  // Match the contain-sized photograph rather than the surrounding stage.
  // The first photograph is the only one mounted or requested on arrival.
  const desktopColumn =
    'calc((min(100vw, 1280px) - 64px - clamp(48px, 5vw, 80px)) / 1.36)'
  const desktopHeight = `clamp(${360 * ratio}px, calc(${100 * ratio}svh - ${250 * ratio}px), ${700 * ratio}px)`
  const mobileHeight = `clamp(${190 * ratio}px, calc(${100 * ratio}svh - ${560 * ratio}px), ${360 * ratio}px)`
  return `(min-width: 1024px) min(${desktopColumn}, ${desktopHeight}), (min-width: 640px) min(calc(100vw - 64px), ${480 * ratio}px), min(calc(100vw - 40px), ${mobileHeight})`
}

export function PhotographStudy({ photos }: { photos: HomePhoto[] }) {
  const [index, setIndex] = useState(0)
  const photo = photos[index]

  if (!photo) return null

  return (
    <figure className={styles.photograph}>
      <Link
        href={photo.href}
        prefetch={false}
        className={styles.photoStage}
        aria-label={`View ${photo.title}`}
      >
        <Image
          key={photo.src}
          src={photo.src}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          sizes={imageSizes(photo)}
          priority={index === 0}
          className={styles.photoImage}
        />
      </Link>
      <figcaption className={styles.photoCaption}>
        <div aria-live="polite" aria-atomic="true">
          <Link
            href={photo.href}
            prefetch={false}
            className={styles.photoTitle}
          >
            {photo.title}
          </Link>
          {photo.location ? (
            <span className={styles.photoLocation}>{photo.location}</span>
          ) : null}
        </div>
        {photos.length > 1 ? (
          <button
            type="button"
            className={styles.anotherPhoto}
            onClick={() => setIndex((current) => (current + 1) % photos.length)}
          >
            Another photograph <span aria-hidden="true">↗</span>
          </button>
        ) : null}
      </figcaption>
    </figure>
  )
}
