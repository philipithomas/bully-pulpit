import { Skeleton } from '@/components/ui/skeleton'

/** Overview skeleton: the prose summary paragraphs, line by line. */
export default function OverviewLoading() {
  return (
    <div>
      <h1 className="sr-only">Overview</h1>
      <div className="max-w-xl space-y-5">
        <div className="space-y-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-11/12" />
          <Skeleton className="h-6 w-3/4" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-6 w-10/12" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      </div>
    </div>
  )
}
