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
            'bg-white border border-gray-200 shadow-lg px-4 py-3 font-sans text-sm flex items-start gap-3 w-[360px]',
          title: 'font-semibold text-gray-950',
          description: 'text-gray-600 text-sm',
          error: 'bg-white border-red/30 [&>[data-icon]]:text-red',
          success: 'bg-white border-forest/30 [&>[data-icon]]:text-forest',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
