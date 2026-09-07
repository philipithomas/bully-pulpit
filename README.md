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

### Local Printing press

The admin uses the normal subscriber session in development. Bring the
development database schema up to date, then start the site normally:

```bash
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in through the normal
email form, and enter `000000` when asked for the six-digit code. That fixed
code works for any email only under `next dev`; production still requires the
generated one-time code. Printing press access remains limited to addresses in
`ADMIN_EMAILS`.

`pnpm db:migrate` changes whichever database is named by the loaded
`DATABASE_URL_UNPOOLED` or `DATABASE_URL`. Confirm that the local environment
points to the development Neon branch before running it.

## Phone and SMS deployment

Inbound Twilio traffic is webhook-based. The app does not poll Twilio for new
calls or messages. Vercel must expose the production routes below, and the
Twilio number must point to them with HTTP `POST`.

Set these environment variables in Vercel before cutover:

```bash
PHONE_NUMBER=
TWILIO_SID=
TWILIO_SECRET=
OWNER_PHONE_NUMBER=
```

Configure the Twilio number:

- Voice, "A call comes in": `https://www.philipithomas.com/api/phone/voice`
- Messaging, "A message comes in": `https://www.philipithomas.com/api/phone/sms`

Every inbound webhook must include Twilio's `X-Twilio-Signature` header. The
app validates the exact public URL and all form parameters with
`TWILIO_SECRET`, the account auth token. Never put that token in a webhook URL.

When `PHONE_NUMBER` is configured, public subscribe prompts offer SMS.
With `OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, and `OPENAI_WEBHOOK_SECRET`
configured, calls connect directly to Bell AI. It opens with a short New York
local greeting, such as “Good evening” or “Happy Labor Day.” Callers can ask
questions, say “leave a voicemail,” or ask to subscribe to new-post texts.
Spoken signup waits for the full disclosure to finish playing before accepting
an explicit yes in a later caller turn. Interrupting the disclosure cancels
that confirmation step. The action always uses the verified calling number.

Manual input remains available: press star during Bell to reach the keypad,
then 1 for voicemail, 2 to subscribe, or 3 to return to Bell. A failed Bell
connection also opens this menu, and no keypad input falls through to
voicemail. Without Bell configuration, the existing greeting and keypad entry
remain available. Before subscription consent, both spoken and keypad paths
identify recurring new-post texts, the one-time contact card, and the
frequency, rate, HELP, and STOP disclosures.

The SMS webhook stores inbound replies, handles signup, HELP, and STOP words,
and emails admins about normal replies. `SUBSCRIBE` replies with a branded
confirmation that identifies the recurring new-post message type, says that
frequency varies and message and data rates may apply, and includes both HELP
and STOP instructions. When Twilio has not already handled the keyword, `HELP`
returns the support address and repeats the frequency, rate, and STOP details.
Voice-menu signups send the same subscription confirmation SMS when Twilio
accepts it; if that confirmation send fails, the spoken confirmation still
tells the caller to text STOP at any time. STOP hard-deletes the local SMS
subscriber and its history instead of retaining an inactive tombstone. A later
keyword or voice-menu signup creates fresh local state, although Twilio may
continue blocking delivery until the handset sends START or UNSTOP.

When a number first becomes active through a `SUBSCRIBE` text, Bell voice, or the
voice menu, the app also sends one Bell onboarding MMS with the contact card at
`https://www.philipithomas.com/bell.vcf`. Repeating `SUBSCRIBE` while the number
is active does not resend the onboarding message. STOP deletes the local SMS
subscriber and its history, so a later signup creates a fresh subscription and
sends the card again. Twilio may still require START or UNSTOP to lift its own
delivery block. The public `/bell.vcf` permalink returns a vCard 3.0 contact
named Bell with the sending number, the configured site organization and
website, and an embedded JPEG Bell contact image. On iPhone, Messages opens the
attachment in the native contact preview, where the person taps Create New
Contact. The site cannot save the contact silently.
New SMS opt-ins, whether they come from a `SUBSCRIBE` text, Bell voice, or the voice menu,
also email admins with the source path, Twilio webhook metadata such as city,
state, caller name, message SID, or call SID when Twilio provides it, and an
area-code hint for common US/Canada numbers.
Keyword handling is both Twilio-aware and application-layer: Twilio may apply
its own START, STOP, or HELP behavior and include `OptOutType` in the webhook.
The app creates a fresh local subscriber for signup keywords and hard-deletes
all local SMS data for STOP while avoiding duplicate Twilio keyword responses. A durable signup
workflow sends app-owned confirmations, pauses for three seconds, and then
sends the distinct one-time Bell onboarding card. Twilio-classified START keeps
Twilio's own confirmation and enters the workflow at the pause. The onboarding
copy tells an iPhone user to tap Create New Contact and invites questions about
philipithomas.com; an SMS link to `/bell.vcf` is the fallback when
the MMS cannot be attached. The configured Twilio
Advanced Opt-Out responses are the user-visible replies for classified START,
STOP, and HELP messages, so their START and HELP copy must stay aligned with the
disclosures and support address above. STOP deletes pending and historical
`sms_sends` rows for that number, and an in-flight workflow treats a missing row
as unsendable.

Newsletter SMS delivery runs inside the same Vercel Workflow as email delivery:
the admin send page enqueues `sms_sends` rows after the email pass, sends them
through Twilio's REST API from `PHONE_NUMBER`, and records outbound texts in the
Phone panel. SMS subscribers are separate from email subscribers and are opted
into every newsletter as one list.

`PHONE_NUMBER` is the public E.164 Twilio number for the active environment. It
appears on subscribe and contact surfaces, including the `/contact.md` mirror,
and is the caller ID for click-to-call.
`OWNER_PHONE_NUMBER` is the private E.164 number that click-to-call rings first.
The admin "Send test text to me" button also sends test newsletter texts there.

After deploy, verify:

```bash
WORKFLOW_SMOKE_BASE_URL=https://www.philipithomas.com CRON_SECRET=$CRON_SECRET pnpm workflow:smoke
```

Then confirm the production flag is still off before launch. With the flag on in
preview, send `SUBSCRIBE`, `HELP`, and `STOP` to `PHONE_NUMBER`, call it and
verify Bell voice requests and the star/keypad options, and confirm `/printing-press/phone` shows the inbound
and outbound thread history. Use a fresh number to verify that both text and
voice signup paths send the Bell card once. Then send STOP and confirm that a
fresh voice signup creates a new local subscription. Twilio may reject its
outbound confirmation until the handset sends START or UNSTOP.
Open the attachment on an actual iPhone, confirm the Bell image and fields
appear, and save it manually.
In the Twilio Console, also confirm the Advanced Opt-Out START and HELP replies
identify the program, include the support address, and match the frequency,
message-and-data-rate, HELP, and STOP disclosures above.

## Production operations

Every scheduled route records best-effort start, success, and failure
heartbeats in `cron_job_health`. The private Printing press Health page shows
those timestamps and uses cadence-specific grace windows to identify failed or
overdue jobs. Heartbeat writes are diagnostic: their failure never changes the
result of the underlying suppression sync, Bell retention, subscriber
backup, or morning report job. Preview deployments keep this health store read-only, even if they
share the production `DATABASE_URL`; `VERCEL_ENV=preview` disables both
lifecycle writes and first-read activation. The schema migration creates empty
health and activation tables.
The first read from successfully deployed monitoring code atomically records a
versioned activation marker and starts every fixed job's grace period; a real
heartbeat can also create its own row first. Activation happens only once, so
later reads preserve both existing history and a missing-row failure instead
of silently granting a new grace period.

The `Production health` GitHub Actions workflow checks the redacted,
bearer-protected `/api/cron/health` endpoint hourly and runs the existing
Workflow smoke after a successful production deployment. Add the production
Vercel `CRON_SECRET` as the GitHub repository secret
`PRODUCTION_CRON_SECRET` to enable both checks. Until that secret is present,
the jobs emit a notice and exit successfully rather than producing a false
alarm. Configure the repository's Actions failure notifications or an alerting
integration so a failed dead-man check reaches an operator.

The repository cannot complete these provider-side operations:

- migrate AWS credentials to a least-privilege IAM role trusted through Vercel
  OIDC, then remove the long-lived production keys;
- configure the desired Actions alert destination and escalation policy;
- run and record a Neon point-in-time restore drill; and
- choose and configure any additional encrypted off-site destination for the
  subscriber export. The monthly email backup remains unchanged here.

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

## Performance budgets

`pnpm build` finishes by measuring the Brotli-compressed modern boot JavaScript
for the homepage, content route, newsletter archives, and photography page. The
guard discovers hashed files from modern script tags in the emitted HTML,
excludes `nomodule` fallbacks, uses the prerender manifest to check every
generated post/content page, and fails when a route exceeds its reviewed
budget. To rerun it against an existing `.next` build without rebuilding, use:

```bash
pnpm performance:check
```

When an intentional feature needs more eager client JavaScript, prefer moving
it behind interaction or a dynamic import. Raise a budget only after reviewing
the resulting first-load tradeoff. This metric does not include chunks fetched
later by interaction or a dynamic import. It also does not count Next.js Link
viewport prefetches: those prepare another route and are separate from the
current route's boot JavaScript.

## License

Copyright (c) 2020-2026 The Contraption Company LLC. All rights reserved.

This repository is source-available for viewing and reference, but no open
license is granted. See [LICENSE](LICENSE).

### Daily admin morning report

At 7am New York time, the site emails each address in `ADMIN_EMAILS` a small
selection from the archive: prior-year posts published on that calendar date,
a word from Diction, a contraption, and a published photo with its recorded
caption and camera metadata. Date-seeded choices and the rendered email are
saved before delivery, so retries keep the same content. Astra through AI
Gateway writes the subject, preview line, and introduction; bounded retries
fall back to useful deterministic copy if generation fails.

Vercel invokes the protected cron every 15 minutes in both possible UTC hours.
Only the local 7am hour proceeds; duplicate invocations share one durable report
owner and each recipient has a completion row. A failed run can resume during
that morning's catch-up window, while cancelled runs stay cancelled. Preview
never sends. SES delivery is at-least-once: a provider acceptance followed by
lost execution acknowledgement or exhausted completion persistence can still
duplicate mail. The Health page monitors completed reports, not cron no-ops.

To inspect an email without sending anything:

```bash
pnpm morning-report:preview 2026-09-08
pnpm morning-report:preview 2026-09-08 --live # Uses AI_GATEWAY_API_KEY
```

The script writes `report.html`, `report.txt`, and `report.json` under
`/tmp/morning-report-YYYY-MM-DD`. It has no email-delivery mode. Open the HTML
in a browser to inspect the email; photos use the same production Vercel image
optimizer as newsletter emails, and HTML has a fixed-width Outlook wrapper.
