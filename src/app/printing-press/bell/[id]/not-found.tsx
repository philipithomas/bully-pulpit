import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function BellConversationNotFound() {
  return (
    <div className="border border-gray-200 bg-white px-5 py-10 text-center">
      <h1 className="font-serif text-2xl text-gray-950">Thread missing</h1>
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
