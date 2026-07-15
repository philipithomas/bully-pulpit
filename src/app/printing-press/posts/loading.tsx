import { PageHeader } from '@/components/printing-press/page-header'
import { Skeleton } from '@/components/ui/skeleton'

const ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

/** Posts skeleton: the send-list rows with title, meta, and badge slots. */
export default function PostsLoading() {
  return (
    <div>
      <PageHeader
        title="Posts"
        description={<Skeleton className="h-4 w-72" />}
      />
      <div className="space-y-1 bg-card p-1">
        {ROWS.map((row) => (
          <div
            key={row}
            className="flex min-h-16 items-center justify-between gap-3 bg-background px-4 py-3"
          >
            <span className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 max-w-72" />
              <Skeleton className="h-3 w-40" />
            </span>
            <Skeleton className="h-5 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
