'use client'

import { useCallback, useState } from 'react'
import { SmsSubscribersClient } from '@/app/printing-press/subscribers/sms-subscribers-client'
import { SubscribersClient } from '@/app/printing-press/subscribers/subscribers-client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SmsSubscriberListItem } from '@/lib/db/queries/sms-subscribers'
import type { SubscriberListItem } from '@/lib/db/queries/subscribers'

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
  const onTabChange = useCallback((nextTab: string) => {
    if (nextTab === 'email' || nextTab === 'sms') setTab(nextTab)
  }, [])

  return (
    <Tabs value={tab} onValueChange={onTabChange}>
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger
          value="email"
          className="min-h-11 flex-1 sm:min-h-9 sm:min-w-28"
        >
          Email
        </TabsTrigger>
        <TabsTrigger
          value="sms"
          className="min-h-11 flex-1 sm:min-h-9 sm:min-w-28"
        >
          SMS
        </TabsTrigger>
      </TabsList>

      <TabsContent value="email" keepMounted>
        <SubscribersClient
          initialRows={initialEmailRows}
          initialTotal={initialEmailTotal}
        />
      </TabsContent>
      <TabsContent value="sms" keepMounted>
        <SmsSubscribersClient
          initialRows={initialSmsRows}
          initialTotal={initialSmsTotal}
        />
      </TabsContent>
    </Tabs>
  )
}
