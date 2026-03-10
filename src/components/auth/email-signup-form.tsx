'use client'

import { ArrowIcon } from '@/components/ui/arrow-icon'
import { useAuthModal } from '@/stores/auth-store'

export function EmailSignupForm() {
  const { openModal } = useAuthModal()

  return (
    <button type="button" onClick={openModal} className="btn btn-primary">
      <span className="btn-text">Subscribe</span>
      <span className="btn-arrow">
        <ArrowIcon className="w-4 h-4" />
      </span>
    </button>
  )
}
