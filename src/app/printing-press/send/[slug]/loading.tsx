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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-48" />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="flex justify-center overflow-auto border border-gray-200 bg-gray-100 p-4">
        <Skeleton className="h-[70vh] w-[600px] max-w-full bg-white" />
      </div>
    </div>
  )
}
