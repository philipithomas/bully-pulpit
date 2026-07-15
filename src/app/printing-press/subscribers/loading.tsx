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

      <div className="mb-4 flex w-full bg-muted p-1 sm:w-fit">
        <Skeleton className="h-11 flex-1 sm:h-9 sm:w-28" />
        <Skeleton className="h-11 flex-1 sm:h-9 sm:w-28" />
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-full sm:w-44" />
        </span>
        <Skeleton className="h-10 w-full sm:w-40" />
      </div>

      <Skeleton className="mb-3 h-3.5 w-36" />

      <div className="space-y-1 bg-card p-1">
        {ROWS.map((row) => (
          <div
            key={row}
            className="flex min-h-16 items-center gap-3 bg-background px-3 py-3 sm:px-4"
          >
            <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-full" />
            <span className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </span>
            <Skeleton className="size-11 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
