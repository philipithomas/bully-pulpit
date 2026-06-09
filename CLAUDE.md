# bully-pulpit

Personal website and blog for philipithomas.com. Next.js with MDX content. Hosted on Vercel.

## Development

```bash
nvm use 24
pnpm install
pnpm dev          # Start dev server with Turbopack
pnpm build        # Production build
pnpm test         # Run Vitest tests (unit + PGlite integration)
pnpm check        # Biome lint + format check
pnpm images:optimize  # Resize oversized images, generate email variants
pnpm content:check    # Validate generated artifacts are in sync (images, summaries/related)
pnpm summaries:generate  # AI summaries for new posts → Chroma post_summaries
pnpm chroma:related   # Recompute src/generated/related-posts.json from summaries
pnpm db:generate  # Generate a Drizzle SQL migration from schema changes
pnpm db:migrate   # Apply migrations to DATABASE_URL (Neon)
pnpm db:studio    # Open Drizzle Studio against the DB
```

## Architecture

- **Content**: MDX files in `content/{contraption,workshop,postcard,pages}/`. New-post pipeline: add MDX (+ cover under `public/images/covers/`) → `pnpm images:optimize` → `pnpm summaries:generate && pnpm chroma:related` → commit the generated artifacts. `pnpm content:check` (offline, fast) validates all of it — email image variants exist/within budget, sources not oversized, every post has a related-posts entry — and runs in **pre-commit, CI, and the Vercel build command**, so a forgotten step fails the deploy instead of silently shipping degraded emails/pages
- **Rendering**: All pages statically generated via `generateStaticParams`
- **Auth**: Client-side overlay; subscribers/OTP/magic-link in Neon Postgres; session is a JWT (jose, HS256) in the httpOnly `bp_token` cookie (`bp_has_session` mirrors login state for the client)
- **Database**: Neon Postgres via Drizzle ORM (`src/lib/db/`). DB clients are lazy so `next build` never needs `DATABASE_URL` — keep all DB access in route handlers / server actions / workflows, never at module scope or in static generation. The `vercel.json` build command is `content:check && db:migrate:deploy && next build && (chroma:sync:deploy || …)`: the offline content check runs first (fails fast before any state change), then migrations, then build, then a **non-fatal** Chroma sync (a Chroma outage can't abort a code deploy). Both migrations and the Chroma sync are **guarded to `VERCEL_ENV=production`** — preview builds must not mutate the shared prod search index or run migrations. `db:migrate` uses `DATABASE_URL_UNPOOLED` when present. Use additive (expand/contract) migrations so a mid-deploy schema/code gap stays backward-compatible
- **Email**: AWS SES (`@aws-sdk/client-sesv2`). Transactional sends (OTP, admin notification) are synchronous; the newsletter blast runs through a durable Vercel Workflow (`src/workflows/send-newsletter.ts`). Delivery is at-least-once (no SES idempotency key). Per-recipient rows snapshot the rendered HTML + plaintext (`text_content`) so the text/plain part carries the real body
- **Admin (Printing Press)**: the admin panel lives at `/printing-press` (`/admin` 307-redirects there), gated by the `ADMIN_EMAILS` allowlist (`src/lib/auth/admin.ts`) on top of a normal signed-in session — page layout guard (`requireAdmin()`) + per-route `guardAdmin()` on every `app/api/printing-press/*` handler. It has a responsive sidenav shell (`src/components/printing-press/`): Overview, Posts (send UI), Subscribers (search by email, gravatar avatars, copy, hard-delete, CSV export/import — columns `email,name,postcard,contraption,workshop,confirmed`, upsert by email; flag columns absent from the CSV only set defaults on new rows, so a bare email list can't re-subscribe opt-outs; export neutralizes spreadsheet formula injection in `email`/`name`). Gravatar avatars knowingly send md5(subscriber email) to Automattic — accepted tradeoff for an admin-only list. The dropdown's "Printing Press" link shows only when `/api/auth/me` reports `isAdmin`
- **Styling**: Tailwind v4 CSS-first config in `src/styles/globals.css`

## Conventions

- Path aliases: `@/*` maps to `./src/*` (relative imports banned by biome)
- Biome for linting/formatting (not ESLint/Prettier)
- Single quotes, no semicolons (biome config)
- Integration tests are `*.integration.test.ts`, colocated, and run real SQL against an in-memory PGlite Postgres (no Docker/network) in the same `pnpm test` run. Harness at `src/test/integration/`: swap the Neon client with `vi.mock('@/lib/db/client', () => import('@/test/integration/db'))` (applies the real migrations, fresh DB per file, `resetDb()` per test), `session.ts` replaces `next/headers` for real-JWT sessions, `mocks.ts` has SES/BotID factories. Mock only external I/O — never `@/lib/db/queries/*`
- Fonts loaded from fonts.philipithomas.com CDN
- Pre-commit hook runs lint-staged, `pnpm content:check`, and `pnpm build` — no need to build manually before pushing

## Next.js docs

For up-to-date Next.js documentation refer to `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

## Key paths

- `content/` - MDX blog posts and pages
- `src/app/` - Next.js App Router pages and API routes (incl. `app/printing-press/` admin UI, `app/api/printing-press/*`, `app/api/cron/*`)
- `src/components/printing-press/` - Printing Press shell (sidenav, mobile Sheet drawer), page header
- `src/components/` - React components (layout, posts, auth, ui)
- `src/lib/` - Content loader, feed generators, config
- `src/lib/db/` - Drizzle schema, lazy client, and query helpers (`queries/`); migrations in `src/lib/db/migrations/`
- `src/lib/email/` - SES client, email templates, body render + transforms, send orchestration
- `src/lib/auth/` - JWT/session, login + subscriber services, admin allowlist guard
- `src/workflows/` - Vercel Workflow definitions (durable newsletter send)
- `src/styles/globals.css` - Tailwind theme + component styles
- `public/images/` - Static images (portraits, covers, post assets)
- `public/images/full/` - Full-resolution originals (preserved for medium-zoom, generated by `pnpm images:optimize`)
- `public/images/email/` - Email-optimized variants (covers at 600px, thumbnails at 200px, generated by `pnpm images:optimize`)

## Prose style guide

When writing or editing prose content (blog posts, page copy, descriptions), follow the style guide in `content/pages/colophon.mdx`.

## Newsletters

- **Contraption** (`/contraption/`): Essays and launches. Forest (#2B4A3E) accent.
- **Workshop** (`/workshop/`): Work in progress notes. Walnut (#6B4D3A) accent.
- **Postcard** (`/postcard/`): Monthly updates. Indigo (#2C3E6B) accent.

Sending: an admin opens `/printing-press` → Posts, picks a post, previews it, sends a test to themselves, then sends to all confirmed subscribers of that newsletter. The send is a durable Vercel Workflow that enqueues per-recipient `email_sends` rows and delivers them in paced, retryable batches via SES (transient errors back off via `RetryableError`). Eligibility excludes anyone already sent or pending; the Send path heals previously-errored rows in place (`resetFailedBySlug`) so a re-send reuses them instead of duplicating. UI primitives are hand-built to the site's warm palette (no shadcn CLI — the default tokens aren't defined); they compose `@radix-ui/react-dialog` (Dialog, Sheet) + cva. If you ever do add a shadcn component, install deps with `-w` (this repo is a pnpm workspace root).

## Maintaining this file

When making major changes (new features, architectural changes, new scripts, new conventions), update this CLAUDE.md to reflect them. This file is the primary onboarding document for future sessions.
