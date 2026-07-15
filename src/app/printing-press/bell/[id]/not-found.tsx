import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function BellConversationNotFound() {
  return (
    <div className="bg-card px-5 py-10 text-center">
      <h1 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight">
        Thread missing
      </h1>
      <p className="mt-2 text-gray-500 text-sm">
        This Bell conversation was deleted, expired, or never existed.
      </p>
      <Link
        href="/printing-press/bell"
        className={buttonVariants({ className: 'mt-5' })}
      >
        Back to Bell
      </Link>
    </div>
  )
}
