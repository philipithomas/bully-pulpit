import Image from 'next/image'
import Link from 'next/link'
import { siteIdentity } from '@/lib/site-identity'

export function Logo() {
  return (
    <Link href="/" className="flex items-center">
      <Image
        src={siteIdentity.wordmark.src}
        alt={siteIdentity.name}
        width={siteIdentity.wordmark.width}
        height={siteIdentity.wordmark.height}
        className="wordmark dark-viewport-invert h-3 w-auto sm:h-[14px]"
        priority
      />
    </Link>
  )
}
