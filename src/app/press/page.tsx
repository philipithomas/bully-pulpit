import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Print Edition — Retired',
}

export default function PressPage() {
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h1 className="text-3xl font-semibold text-gray-950 mb-4">
          Print Edition
        </h1>
        <p className="font-serif text-lg text-gray-600 mb-8">
          The print edition of Postcard has been retired. It was a fun project.
        </p>
        <Link
          href="/introducing-the-print-edition"
          className="font-sans text-sm text-gray-500 hover:text-gray-900 underline decoration-gray-300 underline-offset-2 transition-colors duration-300"
        >
          Read about the print edition
        </Link>
      </div>
    </div>
  )
}
