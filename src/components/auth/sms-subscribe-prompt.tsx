import {
  smsSubscribeDisplayNumber,
  smsSubscribeNumber,
} from '@/lib/phone/sms-subscribe'

export function SmsSubscribePrompt({
  align = 'start',
  className = 'mt-3',
}: {
  align?: 'start' | 'center'
  className?: string
}) {
  return (
    <p
      className={`${className} max-w-md font-serif text-gray-500 text-sm leading-relaxed ${
        align === 'center' ? 'text-center' : ''
      }`}
    >
      Or text{' '}
      <span className="font-sans font-medium text-gray-700">SUBSCRIBE</span> to{' '}
      <a
        href={`sms:${smsSubscribeNumber}?body=SUBSCRIBE`}
        className="font-sans text-gray-700 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-950"
      >
        {smsSubscribeDisplayNumber}
      </a>
      .
    </p>
  )
}
