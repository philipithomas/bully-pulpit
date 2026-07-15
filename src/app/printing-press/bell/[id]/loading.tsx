import { Skeleton } from '@/components/ui/skeleton'

const MESSAGES = ['a', 'b', 'c']

export default function BellThreadLoading() {
  return (
    <div>
      <Skeleton className="mb-6 h-4 w-36" />
      <div className="flex items-start justify-between gap-4">
        <span className="space-y-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-44" />
        </span>
        <Skeleton className="h-9 w-24 sm:w-44" />
      </div>
      <div className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {['first', 'last', 'page', 'retention'].map((item) => (
          <span key={item} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-36" />
          </span>
        ))}
      </div>
      <Skeleton className="mt-10 h-6 w-32" />
      <div className="mt-3 space-y-3">
        {MESSAGES.map((message) => (
          <div
            key={message}
            className="space-y-3 bg-white/70 px-4 py-4 sm:px-5"
          >
            <div className="flex justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  )
}
