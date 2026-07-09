import { PageHeader } from '@/components/printing-press/page-header'
import { Skeleton } from '@/components/ui/skeleton'

const ROWS = ['a', 'b', 'c', 'd', 'e', 'f']

export default function BellLoading() {
  return (
    <div>
      <PageHeader
        title="Bell"
        description={<Skeleton className="h-4 w-80" />}
      />
      <div className="mb-5 border border-gray-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {ROWS.map((row) => (
            <span key={row} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-full" />
            </span>
          ))}
        </div>
        <Skeleton className="mt-4 h-9 w-28" />
      </div>
      <div className="divide-y divide-gray-100 border border-gray-200 bg-white">
        {ROWS.slice(0, 4).map((row) => (
          <div key={row} className="space-y-3 px-4 py-4">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
