function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '')
}

export function isSmsSignupUiEnabled(): boolean {
  return enabled(process.env.NEXT_PUBLIC_SMS_SIGNUP_UI_ENABLED)
}
