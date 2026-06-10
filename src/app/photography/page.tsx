import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { coverPreloadAttrs } from '@/lib/content/cover-preload'
import { getAllPosts } from '@/lib/content/loader'
import type { Post } from '@/lib/content/types'
import { feedDiscovery } from '@/lib/feeds/discovery'

export const metadata: Metadata = {
  title: 'Photography',
  description: 'Cover photographs from posts across the site.',
  // Page-level alternates replace the root layout's, so restate the feeds.
  alternates: { canonical: '/photography', types: feedDiscovery() },
}

/**
 * Target row height for the justified layout. Must match the --row-h
 * values on the gallery container below (240px from the sm breakpoint,
 * 150px under it).
 */
const ROW_HEIGHT = 240

/**
 * Content width of the `.container` at its 80rem cap, minus 2rem padding
 * on each side. Rows never exceed this, so neither does any tile.
 */
const MAX_ROW_WIDTH = 1216

/**
 * Headroom for flex stretch: justification grows tiles past their
 * flex-basis to fill the row, observed at roughly 25 percent.
 */
const STRETCH = 1.25

interface Photo {
  post: Post
  src: string
  alt: string
  width: number
  height: number
}

/**
 * Every post cover, newest first, deduped by image path (the newest post
 * keeps the link). Dimensions come from the content loader, which reads
 * them from the files under public/ at build time.
 */
function collectPhotos(): Photo[] {
  const seen = new Set<string>()
  const photos: Photo[] = []
  for (const post of getAllPosts()) {
    const { coverImage, coverImageAlt, title } = post.frontmatter
    if (!coverImage || !post.coverDimensions) continue
    if (seen.has(coverImage)) continue
    seen.add(coverImage)
    photos.push({
      post,
      src: coverImage,
      alt: coverImageAlt ?? title,
      width: post.coverDimensions.width,
      height: post.coverDimensions.height,
    })
  }
  return photos
}

/**
 * Honest `sizes` for a justified tile. A tile's rendered width is its
 * aspect ratio times the row height, plus stretch. Phones run 150px rows
 * where most tiles fill the row, so 100vw. Tablets run 240px rows about
 * 720px wide. Desktop rows cap at the container, so a px value is exact
 * there. Wide panoramas get correspondingly larger slots instead of being
 * upscaled from a one-third-width rendition.
 */
function tileSizes(ratio: number): string {
  const tabletVw = Math.min(
    100,
    Math.round(((ratio * ROW_HEIGHT * STRETCH) / 720) * 100)
  )
  const desktopPx = Math.min(
    MAX_ROW_WIDTH,
    Math.round(ratio * ROW_HEIGHT * STRETCH)
  )
  return `(max-width: 640px) 100vw, (max-width: 1024px) ${tabletVw}vw, ${desktopPx}px`
}

export default function PhotographyPage() {
  const photos = collectPhotos()

  return (
    <div className="container py-12 md:py-16">
      <div className="mb-10 md:mb-12 flex flex-col items-center text-center">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-950">
          Photography
        </h1>
        <p className="font-serif text-lg text-gray-600 mt-3">
          Cover photographs from posts across the site.
        </p>
      </div>

      {/*
        Justified rows in pure CSS: each tile's flex-grow and flex-basis are
        proportional to its aspect ratio, so tiles in a row share width in
        ratio proportion and land at equal heights (aspect-ratio derives the
        height from the width). The trailing spacer absorbs leftover space
        so the last row keeps the target height instead of stretching.
      */}
      <div className="flex flex-wrap gap-2 [--row-h:150px] sm:[--row-h:240px]">
        {photos.map((photo, index) => {
          const ratio = photo.width / photo.height
          return (
            <Link
              key={photo.src}
              href={`/${photo.post.slug}`}
              className="group relative block overflow-hidden bg-gray-100"
              style={{
                flexGrow: ratio * 100,
                flexBasis: `calc(var(--row-h) * ${ratio.toFixed(4)})`,
                aspectRatio: `${photo.width} / ${photo.height}`,
              }}
              {...coverPreloadAttrs(photo.post)}
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes={tileSizes(ratio)}
                className="object-cover"
                priority={index < 6}
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-gray-950/80 via-gray-950/40 to-transparent px-3 pt-10 pb-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                <span className="block font-serif text-sm leading-snug text-white">
                  {photo.alt}
                </span>
                <span className="mt-1 block font-mono text-[10px] font-medium tracking-[0.15em] uppercase text-gray-300">
                  {photo.post.frontmatter.title}
                </span>
              </span>
            </Link>
          )
        })}
        <div aria-hidden className="grow-[9999] basis-0" />
      </div>
    </div>
  )
}
