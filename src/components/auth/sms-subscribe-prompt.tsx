'use client'

import { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  type AnalyticsNewsletter,
  type AnalyticsPlacement,
  trackClientEvent,
} from '@/lib/analytics/events'
import { cn } from '@/lib/utils'

interface SmsSubscribePromptProps {
  phoneNumber?: string | null
  phoneDisplayNumber?: string | null
  align?: 'start' | 'center'
  className?: string
  analyticsPlacement?: AnalyticsPlacement
  newsletter?: AnalyticsNewsletter
  homepageLabel?: string
  variant?: 'form' | 'homepage'
}

export function SmsSubscribeDisclosure({
  displayNumber,
  onSmsOpen,
  phoneNumber,
}: {
  displayNumber: string
  onSmsOpen: () => void
  phoneNumber: string
}) {
  return (
    <>
      <span className="block text-gray-800">
        Text{' '}
        <span className="font-sans font-medium text-gray-800">SUBSCRIBE</span>{' '}
        to{' '}
        <a
          href={`sms:${phoneNumber}?body=SUBSCRIBE`}
          onClick={onSmsOpen}
          className="font-sans text-gray-700 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-950"
        >
          {displayNumber}
        </a>{' '}
        to receive recurring automated new-post texts for every active
        newsletter from The Contraption Company LLC through philipithomas.com at
        this number.
      </span>
      <span className="mt-6 block text-sm text-gray-500">
        A new or reactivated signup includes one Bell contact-card MMS to save
        to your contacts. You can also text Bell questions about
        philipithomas.com. Message frequency varies. Message and data rates may
        apply. Reply STOP to unsubscribe or HELP for help. Consent is not a
        condition of purchase. See the{' '}
        <a
          href="/terms#text-messaging"
          className="underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-950"
        >
          terms of service
        </a>{' '}
        and{' '}
        <a
          href="/privacy#text-messaging"
          className="underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-950"
        >
          privacy policy
        </a>
        .
      </span>
    </>
  )
}

export function SmsSubscribePrompt({
  phoneNumber,
  phoneDisplayNumber,
  align = 'start',
  className,
  analyticsPlacement = 'unknown',
  newsletter = 'unspecified',
  homepageLabel = 'SMS',
  variant = 'form',
}: SmsSubscribePromptProps) {
  const handleSmsOpen = useCallback(() => {
    trackClientEvent('SMS signup opened', {
      placement: analyticsPlacement,
      newsletter,
    })
  }, [analyticsPlacement, newsletter])

  if (!phoneNumber) return null

  const displayNumber = phoneDisplayNumber ?? phoneNumber
  const isHomepage = variant === 'homepage'

  return (
    <Dialog>
      <span
        className={cn(
          isHomepage
            ? 'font-serif text-gray-500'
            : 'mt-3 block max-w-md font-serif text-sm leading-relaxed text-gray-500',
          align === 'center' && !isHomepage && 'text-center',
          className
        )}
      >
        {isHomepage ? ' or ' : 'Or, '}
        <DialogTrigger asChild>
          <button
            type="button"
            className={cn(
              'underline underline-offset-2 transition-colors duration-300',
              isHomepage
                ? 'decoration-forest hover:text-forest'
                : 'decoration-gray-300 hover:text-gray-950'
            )}
          >
            {isHomepage ? homepageLabel : 'subscribe via SMS'}
          </button>
        </DialogTrigger>
        {isHomepage ? null : '.'}
      </span>

      <DialogContent>
        <DialogHeader className="text-left">
          <DialogTitle>Subscribe by SMS</DialogTitle>
          <DialogDescription className="font-serif text-base leading-relaxed text-gray-600">
            <SmsSubscribeDisclosure
              displayNumber={displayNumber}
              onSmsOpen={handleSmsOpen}
              phoneNumber={phoneNumber}
            />
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
