'use client'

import { ChevronDown, Mail, MessageSquareText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/printing-press/page-header'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'
import {
  forceDarkColorScheme,
  forceLightColorScheme,
} from '@/lib/email/preview'
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
  newsletter: Newsletter
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
  const newsletterName = siteConfig.newsletters[newsletter].name

  // Dark preview: the email's own dark-mode block with its media condition
  // rewritten to always apply (a sandboxed iframe cannot be forced into
  // prefers-color-scheme: dark). Preview only; sends use previewHtml as-is.
  const darkPreviewHtml = useMemo(
    () => forceDarkColorScheme(previewHtml),
    [previewHtml]
  )
  const lightPreviewHtml = useMemo(
    () => forceLightColorScheme(previewHtml),
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

  const handleViewChange = useCallback((next: string) => {
    if (next === 'desktop' || next === 'mobile') setView(next)
  }, [])

  const handleSchemeChange = useCallback((next: string) => {
    if (next === 'light' || next === 'dark') setScheme(next)
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
    sendAudienceParts.length > 0 ? sendAudienceParts.join(' and ') : '0 people'
  const canSend =
    sendingEnabled && (eligible > 0 || smsEligible > 0) && !active && !starting
  const canRetry =
    sendingEnabled && (stats.failed > 0 || stats.pending > 0) && !active

  return (
    <div>
      <PageHeader title={subject} description={previewText}>
        <Badge variant="secondary" className="italic">
          {newsletterName}
        </Badge>
        {!sendingEnabled ? <Badge variant="outline">Archived</Badge> : null}
      </PageHeader>

      <section className="mb-6 bg-card px-4 py-3" aria-label="Delivery status">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-800">Ready for {sendAudience}.</p>
          {active ? <Badge variant="warning">Sending</Badge> : null}
        </div>
        {stats.total > 0 ? (
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <div className="flex gap-1">
              <dt>Sent</dt>
              <dd className="font-mono text-gray-800">{stats.sent}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Pending</dt>
              <dd className="font-mono text-gray-800">{stats.pending}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Failed</dt>
              <dd
                className={
                  stats.failed > 0
                    ? 'font-mono text-red-deep'
                    : 'font-mono text-gray-800'
                }
              >
                {stats.failed}
              </dd>
            </div>
            {stats.skipped > 0 ? (
              <div className="flex gap-1">
                <dt>Skipped</dt>
                <dd className="font-mono text-gray-800">{stats.skipped}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <div className="mt-3 min-h-8">
          {active || stats.total > 0 ? (
            <>
              <Progress value={progress} />
              <p className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                {active ? <Spinner className="h-3 w-3" /> : null}
                {progressText}
              </p>
            </>
          ) : null}
        </div>
      </section>

      {/* Actions */}
      {sendingEnabled ? (
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={testButtonDisabled}
                loading={testButtonDisabled}
                loadingLabel="Sending proof"
                className="w-full sm:w-auto"
              >
                Send proof
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={sendTestEmail}
                disabled={testButtonDisabled}
              >
                <Mail className="h-4 w-4" />
                {testingEmail ? 'Sending email proof' : 'Email proof to me'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={sendTestSms}
                disabled={testButtonDisabled}
              >
                <MessageSquareText className="h-4 w-4" />
                {testingSms ? 'Sending text proof' : 'Text proof to me'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canRetry ? (
            <Button
              className="w-full sm:ml-auto sm:w-auto"
              onClick={retry}
              loading={starting}
              loadingLabel="Continuing send"
            >
              Continue send
            </Button>
          ) : (
            <Button
              className="w-full sm:ml-auto sm:w-auto"
              onClick={openConfirm}
              disabled={!canSend}
            >
              Send issue
            </Button>
          )}
        </div>
      ) : (
        <p className="mb-8 text-sm text-gray-500">
          This newsletter is archived. Test delivery, sends, and retries are
          disabled.
        </p>
      )}

      {/* Preview */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-gray-500">Preview</span>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={handleViewChange}
          aria-label="Preview width"
        >
          <ToggleGroupItem value="desktop">Desktop</ToggleGroupItem>
          <ToggleGroupItem value="mobile">Mobile</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          value={scheme}
          onValueChange={handleSchemeChange}
          aria-label="Preview color scheme"
        >
          <ToggleGroupItem value="light">Light</ToggleGroupItem>
          <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div
        className={cn(
          'border border-gray-200 p-4 flex justify-center overflow-auto',
          scheme === 'dark' ? 'bg-gray-925' : 'bg-gray-100'
        )}
      >
        <iframe
          sandbox=""
          srcDoc={scheme === 'dark' ? darkPreviewHtml : lightPreviewHtml}
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

      <AlertDialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this issue</AlertDialogTitle>
            <AlertDialogDescription>
              Send “{subject}” to {sendAudience}. This delivers email to
              confirmed <cite>{newsletterName}</cite> subscribers and text to
              eligible SMS subscribers who have not received the issue. Once
              delivery begins, you cannot take it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={starting}>
              Keep reviewing
            </AlertDialogCancel>
            <Button
              onClick={confirmSend}
              loading={starting}
              loadingLabel="Starting send"
            >
              Send issue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
