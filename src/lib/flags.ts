import { vercelAdapter } from '@flags-sdk/vercel'
import { flag } from 'flags/next'

export const smsSignupUi = flag<boolean>({
  key: 'sms-signup-ui',
  adapter: vercelAdapter(),
  defaultValue: false,
  options: [
    { value: false, label: 'Hidden' },
    { value: true, label: 'Visible' },
  ],
  description:
    'Show public SMS signup prompts and the phone menu SMS signup option.',
})
