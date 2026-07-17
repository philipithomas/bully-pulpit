import { escapeHtml } from '@/lib/email/escape'

export function renderExistingSubscriberOptInEmail(input: {
  email: string
  name?: string | null
  newsletter: string
}): { html: string; text: string } {
  const email = escapeHtml(input.email)
  const newsletter = escapeHtml(input.newsletter)
  const name = input.name ? escapeHtml(input.name) : null
  const detail = name
    ? `<p style="margin: 0 0 8px;"><strong>Name:</strong> ${name}</p>`
    : ''

  return {
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Existing subscriber opted in</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111110;">
  <h1 style="font-size: 22px;">Existing subscriber opted in</h1>
  ${detail}
  <p style="margin: 0 0 8px;"><strong>Email:</strong> ${email}</p>
  <p style="margin: 0;"><strong>Newsletter:</strong> ${newsletter}</p>
</body>
</html>`,
    text: `Existing subscriber opted in\n\n${
      input.name ? `Name: ${input.name}\n` : ''
    }Email: ${input.email}\nNewsletter: ${input.newsletter}`,
  }
}
