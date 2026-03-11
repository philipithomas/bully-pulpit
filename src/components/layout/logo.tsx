import Image from 'next/image'
import Link from 'next/link'

export function Logo() {
  return (
    <Link href="/" className="flex items-center">
      <Image
        src="/images/philipithomas.svg"
        alt="Philip I. Thomas"
        width={160}
        height={20}
        className="h-2 md:h-2.5 w-auto"
        priority
      />
    </Link>
  )
}
