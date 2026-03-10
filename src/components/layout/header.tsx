import { Search } from 'lucide-react'
import { MemberMenu } from '@/components/auth/member-menu'
import { Logo } from '@/components/layout/logo'

export function Header() {
  return (
    <header className="py-4 md:py-6">
      <div className="container flex items-center justify-between">
        <Logo />
        <nav className="flex items-center gap-3">
          <span title="Search coming soon">
            <Search
              className="h-[18px] w-[18px] text-gray-400 cursor-default"
              aria-hidden="true"
            />
          </span>
          <MemberMenu />
        </nav>
      </div>
    </header>
  )
}
