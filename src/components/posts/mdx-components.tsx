import Image from 'next/image'
import Link from 'next/link'
import type { ComponentPropsWithoutRef } from 'react'
import { getImageDimensions } from '@/lib/content/loader'

/**
 * The prose column is max-w-2xl (672px) inside the 1rem/1.5rem container.
 * The fallback is a bare vw token: Next only parses `NNvw` (not calc()) when
 * pruning srcset candidates, and the bare token halves every srcset.
 */
const PROSE_IMAGE_SIZES = '(min-width: 704px) 672px, 100vw'

/**
 * In-article images: local JPEG/PNG sources render through next/image with
 * build-time intrinsic dimensions (no layout shift), lazy loading, and a
 * responsive srcset served by Vercel image optimization. data-full-src keeps
 * the zoom overlay on the original file instead of an optimized variant.
 * Anything else (GIF, SVG, external) falls back to a plain lazy <img>.
 */
function MdxImage(props: ComponentPropsWithoutRef<'img'>) {
  const { src, alt = '', ...rest } = props
  if (typeof src === 'string' && /^\/images\/.+\.(jpe?g|png)$/i.test(src)) {
    const dims = getImageDimensions(src)
    if (dims) {
      return (
        <Image
          {...rest}
          src={src}
          alt={alt}
          width={dims.width}
          height={dims.height}
          sizes={PROSE_IMAGE_SIZES}
          data-full-src={src}
        />
      )
    }
  }
  // biome-ignore lint/performance/noImgElement: fallback for formats next/image cannot size at build time
  return <img loading="lazy" decoding="async" {...props} alt={alt} />
}

/**
 * In-article links: internal page hrefs go through next/link so static post
 * routes prefetch when the link scrolls into view and navigation stays
 * client-side. Internal FILE links (PDFs, .md exports) stay plain anchors:
 * Link would viewport-prefetch the binary itself. External links pass
 * through unchanged.
 */
function MdxLink(props: ComponentPropsWithoutRef<'a'>) {
  const { href = '', children, ...rest } = props
  const stripped = href.replace(
    /^https?:\/\/(www\.)?philipithomas\.com(?=\/|$)/,
    ''
  )
  const internal = stripped === '' ? '/' : stripped
  const isFile = /\.[a-z0-9]{1,5}([?#]|$)/i.test(internal)
  if (internal.startsWith('/') && !internal.startsWith('//') && !isFile) {
    return (
      <Link href={internal} {...rest}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}

export const mdxComponents = { img: MdxImage, a: MdxLink }
