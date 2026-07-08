# Bully Pulpit

Personal website and blog for [philipithomas.com](https://www.philipithomas.com).

## Features

- Three newsletters: Contraption (essays), Workshop (notes), Postcard (monthly updates)
- MDX content with full React component support
- Static generation with Next.js App Router
- RSS and JSON feeds (combined + per-newsletter)
- LLM-friendly `.md` endpoints for all content
- Google sign-in (OAuth2 authorization code flow)
- Email subscription via [printing-press](https://github.com/philipithomas/printing-press) backend

## Quick Start

```bash
nvm use 24
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Phone and SMS deployment

Inbound Twilio traffic is webhook-based. The app does not poll Twilio for new
calls or messages. Vercel must expose the production routes below, and each
Twilio number must point to them with HTTP `POST`.

Set these environment variables in Vercel before cutover:

```bash
PHONE_WEBHOOK_SECRET=
NEXT_PUBLIC_SMS_SIGNUP_UI_ENABLED=false
TWILIO_SID=
TWILIO_SECRET=
OWNER_PHONE_NUMBER=
```

Configure each Twilio number:

- Voice, "A call comes in": `https://www.philipithomas.com/api/phone/voice?secret=$PHONE_WEBHOOK_SECRET`
- Messaging, "A message comes in": `https://www.philipithomas.com/api/phone/sms?secret=$PHONE_WEBHOOK_SECRET`

The public SMS signup affordances are gated by
`NEXT_PUBLIC_SMS_SIGNUP_UI_ENABLED`: when it is false or unset, web subscribe
prompts do not show the SMS option and the voice webhook records voicemail
without offering "press 2" SMS signup. When the flag is true, the voice webhook
plays the generated greeting, then offers "press 1" for voicemail and "press 2"
to subscribe the caller ID to SMS updates. No input falls through to voicemail.
The SMS webhook stores inbound replies, handles `SUBSCRIBE` and `STOP`, and
emails admins about normal replies.
`SUBSCRIBE` replies with a written confirmation that includes the STOP
instruction. Voice-menu signups send the same confirmation SMS when Twilio
accepts it; if that confirmation send fails, the spoken confirmation still tells
the caller to text STOP at any time.
New SMS opt-ins, whether they come from a `SUBSCRIBE` text or the voice menu,
also email admins with the source path, Twilio webhook metadata such as city,
state, caller name, message SID, or call SID when Twilio provides it, and an
area-code hint for common US/Canada numbers.
STOP handling is both Twilio-aware and application-layer: Twilio may apply its
own opt-out behavior and include `OptOutType=STOP`/`START` in the webhook. The
app still syncs local `sms_subscribers` state, avoids sending a duplicate app
reply when Twilio already sent one, and marks any pending unsent `sms_sends`
rows for that number as skipped so retry cannot send an old post after someone
opts out.

Newsletter SMS delivery runs inside the same Vercel Workflow as email delivery:
the admin send page enqueues `sms_sends` rows after the email pass, sends them
through Twilio's REST API from the NYC number, and records outbound texts in the
Phone panel. SMS subscribers are separate from email subscribers and are opted
into every newsletter as one list.

After deploy, verify:

```bash
WORKFLOW_SMOKE_BASE_URL=https://www.philipithomas.com CRON_SECRET=$CRON_SECRET pnpm workflow:smoke
```

Then confirm the production flag is still off before launch. With the flag on in
preview, send `SUBSCRIBE` and `STOP` to the 212 number, call it and press both
menu options, and confirm `/printing-press/phone` shows the inbound and outbound
thread history.

## Content

Posts live in `content/` as MDX files:

```
content/
├── contraption/    # Essays and launches
├── workshop/       # Work in progress notes
├── postcard/       # Monthly updates
└── pages/          # Static pages (terms, privacy)
```

File format: `YYYY-MM-DD-slug.mdx` with frontmatter:

```yaml
---
title: "Post Title"
description: "Optional description"
publishedAt: "2026-01-15"
coverImage: "/images/covers/slug.jpg"  # optional
---
```

Deployable images live under `public/images/` and should be web-sized, not
camera originals. Before committing new JPG/PNG/WebP/AVIF files, run:

```bash
pnpm images:optimize public/images/path/to/image.jpg
pnpm content:check
```

The optimizer resizes public raster images to the site policy: longest edge at
most 5120px and file size at most 8MB. It skips files that already fit the
policy, so rerunning it on the same image does not keep recompressing it. Keep
full-resolution originals outside this app repository.

## License

Copyright (c) 2020-2026 The Contraption Company LLC. All rights reserved.

This repository is source-available for viewing and reference, but no open
license is granted. See [LICENSE](LICENSE).
