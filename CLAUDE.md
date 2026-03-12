# bully-pulpit

Personal website and blog for philipithomas.com. Next.js with MDX content.

## Development

```bash
nvm use 24
pnpm install
pnpm dev          # Start dev server with Turbopack
pnpm build        # Production build
pnpm test         # Run Vitest unit tests
pnpm test:e2e     # Run Playwright e2e tests
pnpm check        # Biome lint + format check
```

## Architecture

- **Content**: MDX files in `content/{contraption,workshop,postcard,pages}/`
- **Rendering**: All pages statically generated via `generateStaticParams`
- **Auth**: Client-side overlay, JWT in httpOnly cookie, printing-press backend
- **Styling**: Tailwind v4 CSS-first config in `src/styles/globals.css`

## Conventions

- Path aliases: `@/*` maps to `./src/*` (relative imports banned by biome)
- Biome for linting/formatting (not ESLint/Prettier)
- Single quotes, no semicolons (biome config)
- Fonts loaded from fonts.philipithomas.com CDN

## Key paths

- `content/` - MDX blog posts and pages
- `src/app/` - Next.js App Router pages and API routes
- `src/components/` - React components (layout, posts, auth, ui)
- `src/lib/` - Content loader, feed generators, config
- `src/styles/globals.css` - Tailwind theme + component styles
- `public/images/` - Static images (portraits, covers, post assets)

## Prose style guide

When writing or editing prose content (blog posts, page copy, descriptions), follow the style guide in the [colophon](/colophon) (`content/pages/colophon.mdx`).

## Newsletters

- **Contraption** (`/contraption/`): Essays and launches. Forest (#2B4A3E) accent.
- **Workshop** (`/workshop/`): Work in progress notes. Walnut (#6B4D3A) accent.
- **Postcard** (`/postcard/`): Monthly updates. Indigo (#2C3E6B) accent.
