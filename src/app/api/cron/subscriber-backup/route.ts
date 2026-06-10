import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { allSubscribersForExport } from '@/lib/db/queries/subscribers'
import { sendEmailWithAttachment } from '@/lib/email/ses'
import { requireEnv } from '@/lib/env'
import { subscribersToCsv } from '@/lib/subscribers-csv'

// Monthly Vercel Cron (first of the month, 11:00 UTC): emails the admins the
// full subscriber list as a CSV attachment so an off-site backup always
// exists. Vercel automatically sends `Authorization: Bearer $CRON_SECRET` to
// cron paths when CRON_SECRET is set.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${requireEnv('CRON_SECRET')}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const rows = await allSubscribersForExport()
    const csv = subscribersToCsv(rows)
    const date = new Date().toISOString().slice(0, 10)
    const admins = siteConfig.adminEmails
    const noun = rows.length === 1 ? 'subscriber' : 'subscribers'

    await sendEmailWithAttachment({
      to: admins,
      subject: `Subscriber backup ${date}`,
      text: `The attached CSV contains all ${rows.length} ${noun} as of ${date}.`,
      attachment: {
        filename: `subscribers-${date}.csv`,
        contentType: 'text/csv; charset=utf-8',
        content: csv,
      },
    })

    return NextResponse.json({
      sent: admins.length,
      subscriberCount: rows.length,
    })
  } catch (err) {
    console.error('[cron/subscriber-backup] error:', err)
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 })
  }
}
