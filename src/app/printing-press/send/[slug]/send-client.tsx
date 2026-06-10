'use client'

import { useCallback, useEffect, useState } from 'react'
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

type SendStats = {
  total: number
  sent: number
  pending: number
  failed: number
}

interface Props {
  slug: string
  adminEmail: string
  subject: string
  previewText: string
  newsletter: string
  previewHtml: string
  initialEligible: number
  initialStats: SendStats
}

export function SendClient({
  slug,
  adminEmail,
  subject,
  previewText,
  newsletter,
  previewHtml,
  initialEligible,
  initialStats,
}: Props) {
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop')
  const [testing, setTesting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [eligible, setEligible] = useState(initialEligible)
  const [stats, setStats] = useState<SendStats>(initialStats)
  const [active, setActive] = useState(false)

  // Poll send progress from the DB while a send is active.
  useEffect(() => {
    if (!active) return
    let polls = 0
    let sawPending = false
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
        })
        setEligible(data.eligible)
        if (data.pending > 0) sawPending = true
        if (data.pending === 0 && (sawPending || polls >= 6)) {
          setActive(false)
        }
      } catch {
        // transient; keep polling
      }
    }, 2500)
    return () => clearInterval(id)
  }, [active, slug])

  const sendTest = useCallback(async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/printing-press/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const data = await res.json()
      if (res.ok) toast.success(`Test sent to ${data.sentTo ?? adminEmail}`)
      else toast.error(data.error ?? 'Test send failed')
    } catch {
      toast.error('Test send failed')
    } finally {
      setTesting(false)
    }
  }, [slug, adminEmail])

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

  const processed = stats.sent + stats.failed
  const progress = stats.total > 0 ? (processed / stats.total) * 100 : 0
  const canSend = eligible > 0 && !active && !starting
  const canRetry =
    (stats.failed > 0 || stats.pending > 0) && !active && !starting

  return (
    <div>
      <PageHeader title={subject} description={previewText}>
        <Badge variant="secondary" className="capitalize">
          {newsletter}
        </Badge>
      </PageHeader>

      {/* Status */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge variant="outline">{eligible} eligible</Badge>
        {stats.sent > 0 && <Badge variant="success">{stats.sent} sent</Badge>}
        {stats.pending > 0 && (
          <Badge variant="warning">{stats.pending} pending</Badge>
        )}
        {stats.failed > 0 && (
          <Badge variant="destructive">{stats.failed} failed</Badge>
        )}
      </div>

      {(active || stats.total > 0) && (
        <div className="mb-6">
          <Progress value={progress} />
          <p className="text-xs text-gray-500 mt-2 flex items-center gap-2">
            {active && <Spinner className="h-3 w-3" />}
            {processed} of {stats.total} processed
            {active ? ' · sending…' : ''}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <Button variant="outline" onClick={sendTest} disabled={testing}>
          {testing ? <Spinner className="h-4 w-4" /> : `Send test to me`}
        </Button>
        <Button onClick={() => setConfirmOpen(true)} disabled={!canSend}>
          {starting ? (
            <Spinner className="h-4 w-4" />
          ) : (
            `Send to ${eligible} subscriber${eligible === 1 ? '' : 's'}`
          )}
        </Button>
        {canRetry && (
          <Button variant="ghost" onClick={retry}>
            Retry / resume
          </Button>
        )}
      </div>

      {/* Preview */}
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-widest text-gray-500">
          Preview
        </span>
        <div className="flex gap-1">
          <Button
            variant={view === 'desktop' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('desktop')}
          >
            Desktop
          </Button>
          <Button
            variant={view === 'mobile' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('mobile')}
          >
            Mobile
          </Button>
        </div>
      </div>
      <div className="border border-gray-200 bg-gray-100 p-4 flex justify-center overflow-auto">
        <iframe
          sandbox=""
          srcDoc={previewHtml}
          title="Email preview"
          className="bg-white border border-gray-200 h-[70vh]"
          style={{ width: view === 'desktop' ? 600 : 375, maxWidth: '100%' }}
        />
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!starting) setConfirmOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to {eligible} subscribers?</DialogTitle>
            <DialogDescription>
              This emails “{subject}” to every confirmed {newsletter} subscriber
              who has not received it yet. This cannot be undone.
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
