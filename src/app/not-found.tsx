import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-200px)] bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-semibold text-white mb-4">404</h1>
        <p className="text-white/60 font-serif text-xl mb-8">Page not found.</p>
        <Link
          href="/"
          className="text-white/40 text-sm hover:text-white transition-colors"
        >
          &larr; Back to home
        </Link>
      </div>
    </div>
  )
}
