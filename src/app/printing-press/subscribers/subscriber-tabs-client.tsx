'use client'

import { type MouseEvent, useCallback, useState } from 'react'
import { SmsSubscribersClient } from '@/app/printing-press/subscribers/sms-subscribers-client'
import { SubscribersClient } from '@/app/printing-press/subscribers/subscribers-client'
import type { SmsSubscriberListItem } from '@/lib/db/queries/sms-subscribers'
import type { SubscriberListItem } from '@/lib/db/queries/subscribers'
import { cn } from '@/lib/utils'

type SubscriberTab = 'email' | 'sms'

export function SubscriberTabsClient({
  initialEmailRows,
  initialEmailTotal,
  initialSmsRows,
  initialSmsTotal,
}: {
  initialEmailRows: SubscriberListItem[]
  initialEmailTotal: number
  initialSmsRows: SmsSubscriberListItem[]
  initialSmsTotal: number
}) {
  const [tab, setTab] = useState<SubscriberTab>('email')
  const onTabClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const nextTab = event.currentTarget.value
    if (nextTab === 'email' || nextTab === 'sms') setTab(nextTab)
  }, [])

  return (
    <div>
      <div className="mb-5 flex gap-1 border-gray-200 border-b">
        <button
          type="button"
          value="email"
          aria-pressed={tab === 'email'}
          onClick={onTabClick}
          className={cn(
            'border-b-2 px-3 py-2 font-medium text-sm transition-colors',
            tab === 'email'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Email
        </button>
        <button
          type="button"
          value="sms"
          aria-pressed={tab === 'sms'}
          onClick={onTabClick}
          className={cn(
            'border-b-2 px-3 py-2 font-medium text-sm transition-colors',
            tab === 'sms'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          SMS
        </button>
      </div>

      <div hidden={tab !== 'email'}>
        <SubscribersClient
          initialRows={initialEmailRows}
          initialTotal={initialEmailTotal}
        />
      </div>
      <div hidden={tab !== 'sms'}>
        <SmsSubscribersClient
          initialRows={initialSmsRows}
          initialTotal={initialSmsTotal}
        />
      </div>
    </div>
  )
}
