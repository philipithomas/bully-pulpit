import { format } from 'date-fns'
import Link from 'next/link'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { getAllPosts } from '@/lib/content/loader'

export function LatestPostPill() {
  const posts = getAllPosts()
  const latest = posts[0]
  if (!latest) return null

  return (
    <Link
      href={`/${latest.slug}`}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-offwhite-dark rounded-full text-xs group hover:bg-gray-200 transition-colors duration-300"
    >
      <time className="font-mono font-medium tracking-[0.06em] text-gray-500">
        {format(new Date(latest.frontmatter.publishedAt), 'yyyy-MM-dd')}
      </time>
      <span className="text-gray-300">·</span>
      <span className="font-sans font-medium text-gray-700 group-hover:text-forest transition-colors duration-300 truncate max-w-[200px] sm:max-w-xs">
        {latest.frontmatter.title}
      </span>
      <ArrowIcon className="w-3 h-3 text-gray-400 group-hover:text-forest transition-colors duration-300 shrink-0" />
    </Link>
  )
}
