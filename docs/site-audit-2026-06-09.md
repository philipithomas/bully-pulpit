# Site-wide audit — June 9, 2026

Multi-agent review (48 agents, adversarially verified — 24 findings confirmed, 18 refuted).
Two highest-severity items were fixed and pushed immediately (`787b88c`); everything below is the remaining backlog, ordered by impact-per-effort.

## Already fixed (this branch)

- **OTP account takeover**: 6-digit codes were matched globally and the session was signed for the code's owner, not the submitted email; rotating garbage emails dodged the lockout. Codes are now scoped to the account resolved from the submitted email. (`src/lib/auth/login-service.ts`, `src/lib/db/queries/logins.ts`)
- **SES error misclassification**: the permanent-error list used SES v1 names; in SESv2 a malformed address (`BadRequestException`) was retried 7× then stranded the rest of the blast. Classifier now matches exact SESv2 names. (`src/lib/email/errors.ts`)
- Plus the 14 review findings on the email-migration diff itself (commit `b9896e2`): CSV formula injection, import re-subscribe bug, pagination stability, loadMore race, plaintext unsubscribe footer, MDX tags in text part, Sheet a11y, etc.

## High impact

### 1. Chat sidebar, search dialog, and image zoom ship in every page's first-load JS (perf, M)
Stubbing the three cuts every page's script payload **from 400 KB to 238 KB gzipped**. In order:
1. **ChatSidebar** (biggest: `ai` + `@ai-sdk/react` + `react-markdown`): load via `next/dynamic(..., { ssr: false })` in `header.tsx`, render once a `hasOpened` flag in the zustand store flips (keep mounted after first open to preserve sessionStorage state + animation). The `dynamic()` wrapper is load-bearing — conditional render with a static import doesn't split.
2. **ImageZoomOverlay** (`react-zoom-pan-pinch`): move into its own file behind `next/dynamic`; it already renders only when `zoomedImage` is set.
3. **SearchDialog**: lighter (Radix dialog is shared with sign-in), do for completeness. Optionally prefetch the chat chunk on Bell-icon hover.

### 2. Listing pages serialize full MDX bodies into the RSC payload (perf, S)
`/contraption` and `/workshop` pass full `Post` objects (incl. `content`) to `<InfinitePostGrid initialPosts>` — ~100–200 KB of invisible post bodies in the HTML. Map to a slim DTO at the two call sites (`{ slug, newsletter, frontmatter, excerpt }`) and type `InfinitePostGrid` props as a `PostSummary`. Bonus: add `subtitle`/`coverImageAlt` to the `/api/posts` DTO so lazily-loaded cards stop dropping them.

### 3. Stale login rows + global UNIQUE(token) silently break code generation over time (backend, S)
Login rows are never pruned and `generateCode()` has no collision retry, so as the table grows, a fresh code collides with an old row with probability ~N/1,000,000 — the INSERT throws, `sendLoginBestEffort` swallows it, and the user never gets a code. Fix in ~5 lines: retry the code-token `createLogin` up to 3× on SQLSTATE 23505, regenerating the code. Optionally an opportunistic `DELETE ... WHERE expired_at < NOW() - interval '30 days'` inside `createAndSendLogin` (skip the cron).

## Medium impact, small effort

### 4. Sign-in success reload drops the query string (ui)
Both OTP flows do `window.location.assign(pathname + '?signed-in=1')`, discarding params — a reader on `/unsubscribe?token=abc` who signs in lands on "Missing unsubscribe token." And `sign-in-toast.tsx` strips *all* params, not just `signed-in`/`error`. Fix both together with `new URL(window.location.href)` + targeted `searchParams.delete`.

### 5. Suppressed addresses black-hole the OTP (email)
SES silently drops sends to suppressed addresses, so a once-bounced subscriber stares at an OTP form forever. In `createOrRetrieve` (not `createAndSendLogin` — its errors are swallowed): `if (await isSuppressed(email)) throw new SuppressedEmailError()`, mapped to a 422 with a "contact me" message in `/api/subscribe`.

### 6. OTP email is HTML-only (email)
The most delivery-critical message has no text/plain part (the newsletter path does this right). Add `text?` to `sendSimpleEmail`, build it from raw (un-escaped) code + magic link, mirroring the HTML's full content including the expiry line.

### 7. Hand-rolled confirm modals on /account and /unsubscribe (ui)
Escape handler is dead code (backdrop div can't receive focus), no focus trap/aria/scroll-lock. Replace with the existing `@/components/ui/dialog` — ~30 lines deleted per page, all behavior for free.

### 8. Preference toggles and account deletion fail silently (ui)
`handleToggle` snaps the checkbox back with no message on failure (both pages, incl. network-error path); `/account` `handleDelete` has no error branch; the prefs fetch's `.catch(() => {})` leaves the spinner forever; logged-out `/account` has no sign-in affordance (header button hidden < sm). Copy the existing error patterns from `/unsubscribe` + one `useAuthModal().openModal` button.

### 9. Subscribe CTAs pop in after hydration (ui)
`if (authLoading || user) return null` keeps the primary conversion UI out of the static HTML. Invert the gates to `if (user) return null` only — hydration-safe since `user` changes in an effect; accept the brief flash for signed-in members. Do **not** seed from the cookie in a lazy initializer (hydration mismatch).

### 10. Search dialog keyboard nav is dead on the Recent list (ui)
`handleKeyDown` operates on `results` (empty under 2 chars) while the list renders `recentPosts` — the highlighted row ignores Enter. Hoist `displayResults` above the handler and use it for `maxIndex`/Enter. ~5 lines.

### 11. Closed Bell sidebar stays in the tab order on every page (ui)
The off-screen panel leaves up to 8 invisible tab stops; add `inert={!open}` to the panel div. Also swap its `useAuth()` for `useAuthContext()` — currently double-fetches `/api/auth/me` and shows a stale greeting after logout.

### 12. Feeds + llms.txt are dynamic functions for build-time content (perf)
GET route handlers are dynamic by default since Next 15; every feed-reader poll re-parses all 127 MDX files. Add `export const dynamic = 'force-static'` to the 8 feed routes and `llms.txt` (matching `/api/posts/recent`). Skip robots/sitemap — already prerendered.

### 13. Search: no debounce, 3 serial Chroma round-trips, no rate limit (perf + backend)
(a) Debounce `fetchResults` ~200 ms (keep the AbortController). (b) Cache the Chroma collection handle in a lazy module-scope promise (clear on rejection) and `Promise.all` it with `embedSparse` — used by both `/api/search` and the chat search tool. (c) Add `checkRateLimit('search', ip:..)` — requires provisioning a Firewall rule with ID `search` on the personal scope first; size for typeahead (~200–300/10 min), skip BotID here.

### 14. Webfont preloads (perf)
Preconnect exists, but the three above-the-fold faces (Sohne 400/600, Tiempos Text 400) start a full CSS round-trip late. Add three `<link rel="preload" as="font">` in the root layout; don't preload the other five faces.

### 15. ADOPT: a unit test for sendNewsletterWorkflow (vercel-platform, M)
The only irreversible code path has zero tests. WDK directives are no-ops without the compiler, so a plain vitest file can call the workflow directly with mocked step deps (partial-mock `workflow` to stub `getStepMetadata`, keep real `FatalError`/`RetryableError`). Assert: happy path counts, suppressed/permanent-failure rows marked + batch continues, transient error throws `RetryableError` with capped backoff. Reserve `@workflow/vitest` for if the workflow ever grows `sleep()`/hooks.

## Low impact (do opportunistically)

16. **404 page**: white text on off-white until JS adds the dark-viewport class — add `bg-gray-950` to the wrapper (mirror `check-email`'s pattern).
17. **Google sign-in with GSI blocked**: button does nothing (unhandled rejection). Hide the button + "or" divider on script failure; also attach an error listener in the existing-script branch.
18. **Dead Cache-Control blocks** for `/_next/static` and `/_next/image` in `next.config.ts` — no-ops that cause the build warning. Delete both; keep the rest.
19. **Homepage portraits**: both viewport-exclusive images are `priority`, so every device preloads a hidden image. Use the `getImageProps` art-direction `<picture>` pattern (1024 px breakpoint), keep zoom attributes on the `<img>`.
20. **Suppression sync only adds rows**: deletions from the SES list never propagate. After upserting, delete `source = 'ses_suppression_list'` rows not in the fetched set (the catch already guards against destructive deletes on failed fetches).

## Vercel platform verdict (per the "fully utilizing Vercel?" question)

The platform usage is **already right-sized**, verified point by point:

- **Newsletter blast on Workflow DevKit**: idiomatic — durable steps, `RetryableError` with capped backoff, `maxRetries`, idempotent batch re-reads. Keep.
- **Transactional emails (OTP) as workflows**: **SKIP.** The SDK already retries transient SES errors internally, latency matters more than durability for a 15-minute code, and a workflow adds cold-start to the hot path.
- **`createHook()` approval gate before the blast**: **SKIP.** The admin confirm dialog + the 409-on-pending guard already are the approval.
- **`getWritable()` streaming for send progress**: **SKIP.** DB polling of `email_sends` is the source of truth and survives page reloads; streaming would add state without adding truth.
- **SNS event destinations for bounces**: **SKIP.** Hourly suppression polling is the right scale; just make it authoritative (item 20).
- **Runtime Cache / Edge Config / Queues / vercel.ts**: **SKIP.** s-maxage headers already cover the cacheable endpoints; redirects redeploy with content anyway; nothing here needs a queue; the 4-line vercel.json doesn't earn a TS config.
- **Worth adopting**: the workflow unit test (item 15), `force-static` on feeds (item 12), and the Firewall rate-limit rule for search (item 13c) — note `checkRateLimit` is a silent no-op until the rule exists server-side.

## Notable refuted claims (so they don't resurface)

- "No HSTS header" — false: Vercel already serves `strict-transport-security: max-age=63072000` on apex + www (verified live).
- "DMARC missing" — false: `_dmarc.philipithomas.com` exists (verified via dig).
- "Rate-limit keys are IP-spoofable" — false on Vercel: the platform overwrites `x-forwarded-for`.
- "Gmail 102 KB clipping" — closest post renders at 90.3 KB; watch it, but no action yet.
- "getAllPosts is O(n²) per build" — measured as immaterial.
