import { PageHeader } from '@/components/printing-press/page-header'
import { Skeleton } from '@/components/ui/skeleton'

const ROWS = ['a', 'b', 'c', 'd']

export default function BellLoading() {
  return (
    <div>
      <PageHeader
        title="Bell"
        description={<Skeleton className="h-4 w-80" />}
      />
      <div className="mb-7 flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="mt-1.5 h-3 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div>
        {ROWS.map((row) => (
          <div key={row} className="space-y-3 py-5">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-3 w-72 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
