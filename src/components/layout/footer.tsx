import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-400 mt-16">
      <div className="container py-12 md:py-16">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div>
            <Link
              href="/"
              className="text-white font-semibold text-sm tracking-[0.04em] uppercase hover:text-gray-300 transition-colors"
            >
              Philip I. Thomas
            </Link>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link
              href="/contraption"
              className="hover:text-white transition-colors"
            >
              Contraption
            </Link>
            <Link
              href="/workshop"
              className="hover:text-white transition-colors"
            >
              Workshop
            </Link>
            <Link
              href="/postcard"
              className="hover:text-white transition-colors"
            >
              Postcard
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Policies
            </Link>
            <Link
              href="/colophon"
              className="hover:text-white transition-colors"
            >
              Colophon
            </Link>
          </nav>
        </div>
        <div className="mt-12 pt-8 border-t border-gray-900 text-center space-y-3">
          <p className="font-serif text-[13px] text-gray-500">
            <Link
              href="/a-mini-data-center"
              className="hover:text-white transition-colors duration-300"
            >
              Hosted on a Mac Mini in San Francisco.
            </Link>
          </p>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gray-600">
            &copy; {new Date().getFullYear()} The Contraption Company LLC
          </p>
        </div>
      </div>
    </footer>
  )
}
