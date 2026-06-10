import Image from 'next/image'
import Link from 'next/link'
import type { siteConfig } from '@/lib/config'

export type NewsletterConfig =
  (typeof siteConfig.newsletters)[keyof typeof siteConfig.newsletters]

/**
 * Logo + tagline row linking to a newsletter index page. Shared by the
 * homepage newsletter directory and the post-footer cross-promotion block.
 */
export function NewsletterRow({
  newsletter,
}: {
  newsletter: NewsletterConfig
}) {
  return (
    <Link
      href={`/${newsletter.slug}`}
      className="flex items-center gap-3 group"
    >
      <span className="w-[76px] shrink-0 flex items-center">
        <Image
          src={newsletter.logo.src}
          alt={newsletter.name}
          width={100}
          height={newsletter.logo.height}
          style={{ height: newsletter.logo.height }}
          className="w-auto shrink-0"
        />
      </span>
      <span className="font-serif text-sm text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
        {newsletter.tagline}
      </span>
    </Link>
  )
}
