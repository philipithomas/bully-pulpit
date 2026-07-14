import { PageHeader } from '@/components/printing-press/page-header'
import { Skeleton } from '@/components/ui/skeleton'

const ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

/** Subscribers skeleton: toolbar, count line, and avatar list rows. */
export default function SubscribersLoading() {
  return (
    <div>
      <PageHeader
        title="Subscribers"
        description={<Skeleton className="h-4 w-32" />}
      />

      <div className="mb-5 flex gap-2 border-gray-200 border-b pb-2">
        <Skeleton className="h-6 w-14" />
        <Skeleton className="h-6 w-14" />
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-xs" />
        <span className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </span>
      </div>

      <Skeleton className="mb-3 h-3.5 w-36" />

      <div className="divide-y divide-gray-100 border border-gray-200 bg-white">
        {ROWS.map((row) => (
          <div key={row} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-full" />
            <span className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
