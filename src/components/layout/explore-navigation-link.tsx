import Link from 'next/link'

export function ExploreNavigationLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/explore"
      aria-current={active ? 'page' : undefined}
      className="flex min-h-11 items-center px-1 font-medium text-[11px] text-gray-600 uppercase tracking-[0.08em] transition-colors hover:text-gray-950 sm:min-h-0 sm:px-0 sm:py-2 sm:text-xs"
    >
      Explore
    </Link>
  )
}
