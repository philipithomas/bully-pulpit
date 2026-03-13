import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { DarkViewport } from '@/components/layout/dark-viewport'

export default function NotFound() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: 'calc(100vh - 88px)' }}
    >
      <DarkViewport />
      <div className="max-w-xl text-center px-4">
        <h1 className="font-sans text-4xl lg:text-5xl font-semibold tracking-tight text-white">
          404
        </h1>
        <p className="font-serif text-xl text-white/60 mt-6 leading-relaxed">
          Page not found.
        </p>
        <div className="mt-10">
          <Link
            href="/"
            className="no-underline font-mono text-xs font-semibold tracking-[0.12em] uppercase text-white/60 hover:text-white transition-colors duration-300 inline-flex items-center"
          >
            <span>Back to home</span>
            <ArrowRight className="ml-2" size={16} />
          </Link>
        </div>
      </div>
    </div>
  )
}
