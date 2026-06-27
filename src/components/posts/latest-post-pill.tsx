import Link from 'next/link'
import { accentHoverText } from '@/components/posts/newsletter-accent'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { getAllPosts } from '@/lib/content/loader'
import type { Newsletter } from '@/lib/content/types'

// Quiet accent wash on hover, matching the linked post's newsletter.
const accentHoverBg: Record<Newsletter, string> = {
  contraption: 'hover:bg-forest/10',
  workshop: 'hover:bg-walnut/10',
  postcard: 'hover:bg-indigo/10',
  tsundoku: 'hover:bg-sun/10',
}

export function LatestPostPill() {
  const posts = getAllPosts()
  const latest = posts[0]
  if (!latest) return null

  const accentText = accentHoverText[latest.newsletter]

  return (
    <Link
      href={`/${latest.slug}`}
      className={`inline-flex items-center gap-2 px-3 py-1.5 bg-offwhite-dark rounded-full text-xs group ${accentHoverBg[latest.newsletter]} transition-colors duration-300`}
    >
      <span
        className={`font-sans text-[10px] font-medium tracking-[0.06em] uppercase text-gray-500 ${accentText} transition-colors duration-300`}
      >
        New
      </span>
      <span className="text-gray-300">·</span>
      <span
        className={`font-sans font-medium text-gray-700 ${accentText} transition-colors duration-300 truncate max-w-[200px] sm:max-w-xs`}
      >
        {latest.frontmatter.title}
      </span>
      <ArrowIcon
        className={`w-3 h-3 text-gray-400 ${accentText} transition-colors duration-300 shrink-0`}
      />
    </Link>
  )
}
