'use client'

import { useCallback, useRef } from 'react'
import { BrandedAuthDialog } from '@/components/auth/branded-auth-dialog'
import {
  GoogleSignInButton,
  type GoogleSignInUser,
  useGoogleSignInAvailable,
} from '@/components/auth/google-sign-in'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { Spinner } from '@/components/ui/spinner'
import type { AnalyticsPlacement } from '@/lib/analytics/events'
import type { Newsletter } from '@/lib/content/types'

interface EmailCodeConfirmationDialogProps {
  open?: boolean
  code: string
  email: string
  loading: boolean
  onCodeChange: (value: string) => void
  onClose?: () => void
  onDifferentEmail: () => void
  onVerifyCode: (value: string) => void
  googleAnalyticsPlacement?: AnalyticsPlacement
  googleNewsletters?: Newsletter[]
  onGoogleSuccess?: (user: GoogleSignInUser) => boolean | undefined
}

export function EmailCodeConfirmationDialog({
  open = true,
  code,
  email,
  loading,
  onCodeChange,
  onClose,
  onDifferentEmail,
  onVerifyCode,
  googleAnalyticsPlacement = 'unknown',
  googleNewsletters,
  onGoogleSuccess,
}: EmailCodeConfirmationDialogProps) {
  const googleAvailable = useGoogleSignInAvailable() && Boolean(onGoogleSuccess)
  const inputRef = useRef<HTMLInputElement>(null)
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) (onClose ?? onDifferentEmail)()
    },
    [onClose, onDifferentEmail]
  )

  return (
    <BrandedAuthDialog
      open={open}
      onOpenChange={handleOpenChange}
      initialFocus={inputRef}
      title="Check your email"
      description={
        googleAvailable
          ? `Check ${email} for a 6-digit code, or finish with Google.`
          : `Check ${email} for a 6-digit code.`
      }
      footer={
        <button
          type="button"
          onClick={onDifferentEmail}
          disabled={loading}
          className="text-left text-sm text-gray-500 transition-colors hover:text-gray-700 disabled:opacity-50"
        >
          Use a different email
        </button>
      }
    >
      <div className="mt-8 max-w-sm space-y-4">
        <InputOTP
          ref={inputRef}
          maxLength={6}
          value={code}
          onChange={onCodeChange}
          onComplete={onVerifyCode}
          disabled={loading}
          aria-label="6-digit code"
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Spinner className="h-3.5 w-3.5" />
            <span>Verifying</span>
          </div>
        ) : null}
        {googleAvailable && onGoogleSuccess ? (
          <>
            <p className="font-sans text-xs text-gray-400">or</p>
            <GoogleSignInButton
              loginHint={email}
              newsletters={googleNewsletters}
              analyticsPlacement={googleAnalyticsPlacement}
              onSuccess={onGoogleSuccess}
            />
          </>
        ) : null}
      </div>
    </BrandedAuthDialog>
  )
}
