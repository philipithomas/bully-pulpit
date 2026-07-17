'use client'

import { useCallback } from 'react'
import { ArrowIcon } from '@/components/ui/arrow-icon'
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
  triggerClassName?: string
  triggerLabel?: string
  variant?: 'form' | 'homepage' | 'link' | 'standalone'
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
    <div className="mt-6">
      <div>
        <a
          href={`sms:${phoneNumber}?body=SUBSCRIBE`}
          onClick={onSmsOpen}
          className="btn btn-primary w-full sm:w-auto"
        >
          <span className="btn-text">Open Messages</span>
          <span className="btn-arrow" aria-hidden>
            <ArrowIcon className="h-4 w-4" />
          </span>
        </a>
        <p className="mt-2 font-serif text-sm text-gray-500">
          <span className="font-sans font-medium text-gray-700">SUBSCRIBE</span>{' '}
          is filled in for you.
        </p>
      </div>

      <ul className="mt-6 list-disc space-y-2 pl-5 font-serif text-sm leading-relaxed text-gray-700 marker:text-gray-300">
        <li>New posts from every active newsletter</li>
        <li>One Bell contact card to save after signup</li>
        <li>A direct reply when you text Bell a question</li>
      </ul>

      <p className="mt-6 font-serif text-sm leading-relaxed text-gray-600">
        Prefer to type it yourself? Text{' '}
        <span className="font-sans font-medium text-gray-800">SUBSCRIBE</span>{' '}
        to{' '}
        <a
          href={`sms:${phoneNumber}?body=SUBSCRIBE`}
          onClick={onSmsOpen}
          className="font-sans text-gray-700 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-950"
        >
          {displayNumber}
        </a>
        . Previously opted out? Text{' '}
        <a
          href={`sms:${phoneNumber}?body=START`}
          onClick={onSmsOpen}
          className="font-sans text-gray-700 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-950"
        >
          START
        </a>{' '}
        or UNSTOP instead.
      </p>

      <p className="mt-6 font-serif text-xs leading-relaxed text-gray-500">
        Recurring automated new-post texts from The Contraption Company LLC
        through philipithomas.com. Message frequency varies. Message and data
        rates may apply. Reply STOP to unsubscribe or HELP for help. Consent is
        not a condition of purchase. See the{' '}
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
      </p>
    </div>
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
  triggerClassName,
  triggerLabel,
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
  const isLink = variant === 'link'
  const isStandalone = variant === 'standalone'

  return (
    <Dialog>
      <span
        className={cn(
          isStandalone
            ? 'block'
            : isHomepage
              ? 'font-serif text-gray-500'
              : isLink
                ? 'inline'
                : 'mt-3 block max-w-md font-serif text-sm leading-relaxed text-gray-500',
          align === 'center' && !isHomepage && 'text-center',
          className
        )}
      >
        {isStandalone || isLink ? null : isHomepage ? ' or ' : 'Or, '}
        <DialogTrigger asChild>
          <button
            type="button"
            className={cn(
              isStandalone
                ? 'btn'
                : 'underline underline-offset-2 transition-colors duration-300',
              !isStandalone &&
                (isHomepage
                  ? 'decoration-forest hover:text-forest'
                  : 'decoration-gray-300 hover:text-gray-950'),
              triggerClassName
            )}
          >
            {triggerLabel ??
              (isStandalone
                ? 'Subscribe by SMS'
                : isHomepage
                  ? homepageLabel
                  : 'subscribe via SMS')}
          </button>
        </DialogTrigger>
        {isHomepage || isLink || isStandalone ? null : '.'}
      </span>

      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto p-6 sm:w-[calc(100%-2rem)] sm:p-8">
        <DialogHeader className="gap-3 text-left">
          <DialogTitle>Get posts by text</DialogTitle>
          <DialogDescription className="font-serif text-base leading-relaxed text-gray-600">
            Open Messages and send the pre-filled word SUBSCRIBE to receive
            every new post by text.
          </DialogDescription>
        </DialogHeader>
        <SmsSubscribeDisclosure
          displayNumber={displayNumber}
          onSmsOpen={handleSmsOpen}
          phoneNumber={phoneNumber}
        />
      </DialogContent>
    </Dialog>
  )
}
