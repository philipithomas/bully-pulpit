'use client'

import { Button } from '@/components/ui/button'

export default function BellError({ reset }: { reset: () => void }) {
  return (
    <div className="border border-red/30 bg-red/5 px-5 py-8 text-center">
      <h1 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight">
        Bell lost the thread
      </h1>
      <p className="mt-2 text-gray-600 text-sm">
        The conversation archive could not be loaded.
      </p>
      <Button type="button" className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
