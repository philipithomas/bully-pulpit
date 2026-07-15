import { Skeleton } from '@/components/ui/skeleton'

/**
 * Send-page skeleton: header, status badges, action buttons, and the email
 * preview frame. This page renders the full newsletter server-side before
 * responding, so the skeleton carries the longest wait in the admin panel.
 */
export default function SendLoading() {
  return (
    <div>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="mb-6 h-24 bg-card px-4 py-3">
        <Skeleton className="h-4 w-72 max-w-full" />
        <div className="mt-3 flex gap-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="mt-3 h-1.5 w-full" />
      </div>

      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Skeleton className="h-10 w-full sm:w-32" />
        <Skeleton className="h-10 w-full sm:w-28" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex justify-center overflow-auto border border-gray-200 bg-gray-100 p-4">
        <Skeleton className="h-[70vh] w-[600px] max-w-full bg-white" />
      </div>
    </div>
  )
}
