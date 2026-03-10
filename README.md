# Bully Pulpit

Personal website and blog for [philipithomas.com](https://philipithomas.com).

## Features

- Three newsletters: Contraption (essays), Workshop (notes), Postcard (monthly updates)
- MDX content with full React component support
- Static generation with Next.js App Router
- RSS and JSON feeds (combined + per-newsletter)
- LLM-friendly `.md` endpoints for all content
- Google One Tap sign-in
- Email subscription via [printing-press](https://github.com/philipithomas/printing-press) backend

## Quick Start

```bash
nvm use 24
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

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

## License

MIT - Philip I. Thomas
