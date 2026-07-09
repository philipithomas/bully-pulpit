'use client'

import Image from 'next/image'
import type { ComponentProps, ReactNode } from 'react'
import { useCallback, useRef } from 'react'
import { Logo } from '@/components/layout/logo'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

interface BrandedAuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete?: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  children: ReactNode
  footer?: ReactNode
  initialFocus?: ComponentProps<typeof DialogContent>['initialFocus']
}

/** Shared full-viewport shell for subscriber authentication and onboarding. */
export function BrandedAuthDialog({
  open,
  onOpenChange,
  onOpenChangeComplete,
  title,
  description,
  children,
  footer,
  initialFocus,
}: BrandedAuthDialogProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const resolvedInitialFocus = initialFocus ?? titleRef
  const handleLogoClick = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={resolvedInitialFocus}
        className="inset-0 left-0 top-0 z-[70] h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto bg-offwhite p-0 shadow-none duration-500 data-[ending-style]:scale-[0.99] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.99] data-[starting-style]:opacity-0 motion-reduce:transition-none"
      >
        <div className="grid min-h-dvh lg:grid-cols-2">
          <section className="flex min-h-dvh flex-col px-6 py-6 sm:px-10 sm:py-8 lg:px-12 xl:px-16">
            <div onClickCapture={handleLogoClick}>
              <Logo />
            </div>

            <div className="my-auto w-full max-w-xl animate-in fade-in slide-in-from-bottom-2 py-10 duration-500 motion-reduce:animate-none sm:py-12">
              <DialogTitle
                ref={titleRef}
                tabIndex={-1}
                data-no-focus-ring
                className="text-3xl sm:text-4xl"
              >
                {title}
              </DialogTitle>
              <DialogDescription className="mt-3 max-w-lg font-serif text-base leading-relaxed text-gray-600 sm:text-lg">
                {description}
              </DialogDescription>
              {children}
            </div>

            {footer ?? <div aria-hidden />}
          </section>

          <div className="relative hidden min-h-dvh animate-in fade-in overflow-hidden duration-700 motion-reduce:animate-none lg:block">
            <Image
              src="/images/covers/tsundoku/bamboo-forest.jpg"
              alt=""
              fill
              sizes="50vw"
              className="object-cover object-[25%_center]"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
