import Link from 'next/link'
import { MemberMenu } from '@/components/auth/member-menu'
import { Logo } from '@/components/layout/logo'

export function Header() {
  return (
    <header className="py-4 md:py-6">
      <div className="container flex items-center justify-between">
        <Logo />
        <nav className="flex items-center gap-6">
          <Link
            href="/contraption"
            className="hidden sm:inline-block text-[13px] font-semibold tracking-[0.04em] uppercase text-gray-700 hover:text-gray-900 transition-colors"
          >
            Contraption
          </Link>
          <Link
            href="/workshop"
            className="hidden sm:inline-block text-[13px] font-semibold tracking-[0.04em] uppercase text-gray-700 hover:text-gray-900 transition-colors"
          >
            Workshop
          </Link>
          <Link
            href="/postcard"
            className="hidden sm:inline-block text-[13px] font-semibold tracking-[0.04em] uppercase text-gray-700 hover:text-gray-900 transition-colors"
          >
            Postcard
          </Link>
          <MemberMenu />
        </nav>
      </div>
    </header>
  )
}
