import Image from 'next/image'
import Link from 'next/link'
import {
  type ComponentPropsWithoutRef,
  isValidElement,
  type ReactNode,
} from 'react'
import { getImageDimensions } from '@/lib/content/loader'
import { createSlugger } from '@/lib/content/slugify'

/**
 * The prose column is max-w-2xl (672px) inside the 1rem/1.5rem container.
 * The fallback is a bare vw token: Next only parses `NNvw` (not calc()) when
 * pruning srcset candidates, and the bare token halves every srcset.
 */
const PROSE_IMAGE_SIZES = '(min-width: 704px) 672px, 100vw'

/**
 * In-article images: local JPEG/PNG sources render through next/image with
 * build-time intrinsic dimensions (no layout shift), lazy loading, and a
 * responsive srcset served by Vercel image optimization. data-full-src points
 * the zoom overlay at the original public image instead of an optimized
 * variant. Anything else (GIF, SVG, external) falls back to a plain lazy <img>.
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

/** Flattens React children to their text content, depth first. */
function getTextContent(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getTextContent).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getTextContent(node.props.children)
  }
  return ''
}

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

/**
 * Headings with stable GitHub-style anchor ids, slugged from their text via
 * the shared slugify util so anchors computed from raw markdown (for
 * example Bell citations) land on the same ids. Call once per MDXRemote
 * render: the slugger deduplicates repeated headings within one document
 * and must not leak counts across documents.
 */
export function createHeadingComponents() {
  const slug = createSlugger()
  function makeHeading(Tag: HeadingTag) {
    return function MdxHeading({
      children,
      ...rest
    }: ComponentPropsWithoutRef<HeadingTag>) {
      const id = slug(getTextContent(children))
      return (
        <Tag id={id || undefined} {...rest}>
          {children}
        </Tag>
      )
    }
  }
  return {
    h1: makeHeading('h1'),
    h2: makeHeading('h2'),
    h3: makeHeading('h3'),
    h4: makeHeading('h4'),
    h5: makeHeading('h5'),
    h6: makeHeading('h6'),
  }
}
