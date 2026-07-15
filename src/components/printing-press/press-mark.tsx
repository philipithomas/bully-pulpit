import Link from 'next/link'

/**
 * A small ink block with a deliberately offset brass impression. The mark is
 * quiet enough to sit inside the public-site shell while giving this private
 * workspace an identity of its own.
 */
export function PressMark() {
  return (
    <Link
      href="/printing-press"
      className="group inline-flex shrink-0 items-center gap-3 font-sans font-semibold text-gray-950 text-lg tracking-tight"
    >
      <span aria-hidden="true" className="relative size-4 shrink-0">
        <span className="absolute inset-0 translate-x-0.5 translate-y-0.5 bg-brass transition-transform group-hover:translate-x-1 group-hover:translate-y-1" />
        <span className="absolute inset-0 bg-gray-950" />
      </span>
      <span>Printing press</span>
    </Link>
  )
}
