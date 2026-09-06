import Image, { type ImageProps } from 'next/image'
import { TIDBITS_WORDMARK_PATHS } from '@/lib/tidbits/wordmark'

/** Tidbits uses the document palette; other newsletter assets render as before. */
export function NewsletterWordmark({
  tone = 'light',
  ...props
}: ImageProps & { tone?: 'light' | 'dark' }) {
  if (props.src !== '/images/tidbits.svg') return <Image {...props} />

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1688 369"
      width={1688}
      height={369}
      role="img"
      aria-label={props.alt}
      className={`tidbits-wordmark ${props.className ?? ''}`}
      style={{
        color: `var(--tidbits-${tone === 'dark' ? 'dark' : 'accent'})`,
        ...props.style,
      }}
      fill="currentColor"
    >
      {TIDBITS_WORDMARK_PATHS.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  )
}
