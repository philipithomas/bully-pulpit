import { Skeleton } from '@/components/ui/skeleton'

const MESSAGES = ['a', 'b', 'c']

export default function BellThreadLoading() {
  return (
    <div>
      <Skeleton className="mb-6 h-4 w-36" />
      <div className="flex justify-between gap-4">
        <span className="space-y-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-44" />
        </span>
        <span className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </span>
      </div>
      <div className="mt-6 grid gap-3 border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-10 w-44" />
      </div>
      <Skeleton className="mt-8 h-6 w-32" />
      <div className="mt-3 space-y-3">
        {MESSAGES.map((message) => (
          <div
            key={message}
            className="space-y-3 border border-gray-200 bg-white px-4 py-3"
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
