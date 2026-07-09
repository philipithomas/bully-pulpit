'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/printing-press/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { forceDarkColorScheme } from '@/lib/email/preview'
import { cn } from '@/lib/utils'

type SendStats = {
  total: number
  sent: number
  pending: number
  failed: number
  skipped: number
}

interface Props {
  slug: string
  adminEmail: string
  subject: string
  previewText: string
  newsletter: string
  previewHtml: string
  initialEligible: number
  initialSmsEligible: number
  initialStats: SendStats
  initialActive: boolean
  sendingEnabled: boolean
}

export function SendClient({
  slug,
  adminEmail,
  subject,
  previewText,
  newsletter,
  previewHtml,
  initialEligible,
  initialSmsEligible,
  initialStats,
  initialActive,
  sendingEnabled,
}: Props) {
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop')
  const [scheme, setScheme] = useState<'light' | 'dark'>('light')
  const [testingEmail, setTestingEmail] = useState(false)
  const [testingSms, setTestingSms] = useState(false)
  const [starting, setStarting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [eligible, setEligible] = useState(initialEligible)
  const [smsEligible, setSmsEligible] = useState(initialSmsEligible)
  const [stats, setStats] = useState<SendStats>(initialStats)
  const [active, setActive] = useState(initialActive)

  // Dark preview: the email's own dark-mode block with its media condition
  // rewritten to always apply (a sandboxed iframe cannot be forced into
  // prefers-color-scheme: dark). Preview only; sends use previewHtml as-is.
  const darkPreviewHtml = useMemo(
    () => forceDarkColorScheme(previewHtml),
    [previewHtml]
  )

  // Poll send progress from the DB while a send is active.
  useEffect(() => {
    if (!active) return
    let polls = 0
    let sawPending = false
    // Stall detection: if no row moves (sent + failed unchanged) for this many
    // consecutive polls while rows are still pending, the run has died. 36
    // polls x 2.5s = 90s, comfortably above the workflow's worst case (a 60s
    // max batch backoff plus a batch's send time). Flipping active off then
    // surfaces the Retry / resume button so the stalled send can be taken over
    // in-tab, not just after a reload.
    const STALL_POLLS = 36
    let lastProcessed = -1
    let stalledPolls = 0
    const id = setInterval(async () => {
      polls += 1
      try {
        const res = await fetch(`/api/printing-press/send-status/${slug}`)
        if (!res.ok) return
        const data = await res.json()
        setStats({
          total: data.total,
          sent: data.sent,
          pending: data.pending,
          failed: data.failed,
          skipped: data.skipped ?? 0,
        })
        setEligible(data.eligible)
        setSmsEligible(data.smsEligible ?? 0)
        const runActive = Boolean(data.active)
        setActive(runActive)
        if (runActive) {
          if (data.pending > 0) sawPending = true
          return
        }
        if (data.pending > 0) sawPending = true
        if (data.pending === 0 && (sawPending || polls >= 6)) {
          setActive(false)
          return
        }
        const processed = data.sent + data.failed + (data.skipped ?? 0)
        if (data.pending > 0 && processed === lastProcessed) {
          stalledPolls += 1
          if (stalledPolls >= STALL_POLLS) setActive(false)
        } else {
          stalledPolls = 0
        }
        lastProcessed = processed
      } catch {
        // transient; keep polling
      }
    }, 2500)
    return () => clearInterval(id)
  }, [active, slug])

  const sendTest = useCallback(
    async (channel: 'email' | 'sms') => {
      if (channel === 'email') setTestingEmail(true)
      else setTestingSms(true)
      try {
        const res = await fetch('/api/printing-press/send-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, channel }),
        })
        const data = await res.json()
        if (res.ok) {
          toast.success(
            channel === 'email'
              ? `Test email sent to ${data.sentTo ?? adminEmail}`
              : `Test text sent to ${data.sentTo ?? 'the test number'}`
          )
        } else {
          toast.error(data.error ?? 'Test send failed')
        }
      } catch {
        toast.error('Test send failed')
      } finally {
        if (channel === 'email') setTestingEmail(false)
        else setTestingSms(false)
      }
    },
    [slug, adminEmail]
  )

  const sendTestEmail = useCallback(async () => {
    await sendTest('email')
  }, [sendTest])

  const sendTestSms = useCallback(async () => {
    await sendTest('sms')
  }, [sendTest])

  const openConfirm = useCallback(() => {
    setConfirmOpen(true)
  }, [])

  const setDesktopView = useCallback(() => {
    setView('desktop')
  }, [])

  const setMobileView = useCallback(() => {
    setView('mobile')
  }, [])

  const setLightScheme = useCallback(() => {
    setScheme('light')
  }, [])

  const setDarkScheme = useCallback(() => {
    setScheme('dark')
  }, [])

  const handleConfirmOpenChange = useCallback(
    (open: boolean) => {
      if (!starting) setConfirmOpen(open)
    },
    [starting]
  )

  const testButtonDisabled = testingEmail || testingSms

  const confirmSend = useCallback(async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/printing-press/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Sending started')
        setActive(true)
        setConfirmOpen(false)
      } else {
        toast.error(data.error ?? 'Could not start send')
      }
    } catch {
      toast.error('Could not start send')
    } finally {
      setStarting(false)
    }
  }, [slug])

  const retry = useCallback(async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/printing-press/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(
          data.reset > 0 ? `Retrying ${data.reset} failed` : 'Resuming send'
        )
        setActive(true)
      } else {
        toast.error(data.error ?? 'Could not retry')
      }
    } catch {
      toast.error('Could not retry')
    } finally {
      setStarting(false)
    }
  }, [slug])

  const processed = stats.sent + stats.failed + stats.skipped
  const progress = stats.total > 0 ? (processed / stats.total) * 100 : 0
  const progressText =
    active && stats.total === 0
      ? 'Preparing send'
      : `${processed} of ${stats.total} processed${active ? ' · sending' : ''}`
  const sendAudienceParts = [
    eligible > 0
      ? `${eligible} email subscriber${eligible === 1 ? '' : 's'}`
      : null,
    smsEligible > 0
      ? `${smsEligible} SMS subscriber${smsEligible === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean)
  const sendAudience =
    sendAudienceParts.length > 0 ? sendAudienceParts.join(' + ') : '0 people'
  const canSend =
    sendingEnabled && (eligible > 0 || smsEligible > 0) && !active && !starting
  const canRetry =
    sendingEnabled &&
    (stats.failed > 0 || stats.pending > 0) &&
    !active &&
    !starting

  return (
    <div>
      <PageHeader title={subject} description={previewText}>
        <Badge variant="secondary" className="capitalize">
          {newsletter}
        </Badge>
        {!sendingEnabled ? <Badge variant="outline">Archived</Badge> : null}
      </PageHeader>

      {/* Status */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge variant="outline">{eligible} email eligible</Badge>
        {smsEligible > 0 ? (
          <Badge variant="outline">{smsEligible} SMS</Badge>
        ) : null}
        {stats.sent > 0 && <Badge variant="success">{stats.sent} sent</Badge>}
        {stats.pending > 0 && (
          <Badge variant="warning">{stats.pending} pending</Badge>
        )}
        {stats.failed > 0 && (
          <Badge variant="destructive">{stats.failed} failed</Badge>
        )}
        {stats.skipped > 0 && (
          <Badge variant="secondary">{stats.skipped} skipped</Badge>
        )}
        {active ? <Badge variant="warning">Sending</Badge> : null}
      </div>

      {(active || stats.total > 0) && (
        <div className="mb-6">
          <Progress value={progress} />
          <p className="text-xs text-gray-500 mt-2 flex items-center gap-2">
            {active ? <Spinner className="h-3 w-3" /> : null}
            {progressText}
          </p>
        </div>
      )}

      {/* Actions */}
      {sendingEnabled ? (
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <Button
            variant="outline"
            onClick={sendTestEmail}
            disabled={testButtonDisabled}
          >
            {testingEmail ? (
              <Spinner className="h-4 w-4" />
            ) : (
              `Send test email to me`
            )}
          </Button>
          <Button
            variant="outline"
            onClick={sendTestSms}
            disabled={testButtonDisabled}
          >
            {testingSms ? (
              <Spinner className="h-4 w-4" />
            ) : (
              `Send test text to me`
            )}
          </Button>
          <Button onClick={openConfirm} disabled={!canSend}>
            {starting ? (
              <Spinner className="h-4 w-4" />
            ) : (
              `Send to ${sendAudience}`
            )}
          </Button>
          {canRetry ? (
            <Button variant="ghost" onClick={retry}>
              Retry / resume
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="mb-8 text-sm text-gray-500">
          This newsletter is archived. Test delivery, sends, and retries are
          disabled.
        </p>
      )}

      {/* Preview */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-gray-500">Preview</span>
        <div className="flex gap-1">
          <Button
            variant={view === 'desktop' ? 'default' : 'outline'}
            size="sm"
            onClick={setDesktopView}
          >
            Desktop
          </Button>
          <Button
            variant={view === 'mobile' ? 'default' : 'outline'}
            size="sm"
            onClick={setMobileView}
          >
            Mobile
          </Button>
        </div>
        <div className="flex gap-1">
          <Button
            variant={scheme === 'light' ? 'default' : 'outline'}
            size="sm"
            onClick={setLightScheme}
          >
            Light
          </Button>
          <Button
            variant={scheme === 'dark' ? 'default' : 'outline'}
            size="sm"
            onClick={setDarkScheme}
          >
            Dark
          </Button>
        </div>
      </div>
      <div
        className={cn(
          'border border-gray-200 p-4 flex justify-center overflow-auto',
          scheme === 'dark' ? 'bg-gray-925' : 'bg-gray-100'
        )}
      >
        <iframe
          sandbox=""
          srcDoc={scheme === 'dark' ? darkPreviewHtml : previewHtml}
          title="Email preview"
          className={cn(
            'border border-gray-200 h-[70vh]',
            scheme === 'light' && 'bg-white'
          )}
          style={{
            width: view === 'desktop' ? 600 : 375,
            maxWidth: '100%',
            // Match the email's dark body color so there is no white flash
            // while the dark srcDoc loads.
            ...(scheme === 'dark' ? { backgroundColor: '#121110' } : {}),
          }}
        />
      </div>

      <Dialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to {sendAudience}?</DialogTitle>
            <DialogDescription>
              This emails “{subject}” to every confirmed {newsletter} subscriber
              and texts every SMS subscriber who has not received it yet. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <DialogClose asChild>
              <Button variant="outline" disabled={starting}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={confirmSend} disabled={starting}>
              {starting ? <Spinner className="h-4 w-4" /> : 'Send now'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
