'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'bg-card border border-border shadow-lg px-4 py-3 font-sans text-sm flex items-start gap-3 w-[min(360px,calc(100vw-2rem))]',
          title: 'font-semibold text-gray-950',
          description: 'text-gray-600 text-sm',
          error: 'bg-card border-red/30 [&>[data-icon]]:text-red',
          success: 'bg-card border-forest/30 [&>[data-icon]]:text-forest',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
