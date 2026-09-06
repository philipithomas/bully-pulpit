import savedAssignments from '@/lib/tidbits/palette-assignments.json'

/**
 * The five Tidbits color studies, PRs #431–#435. Published photos have saved
 * assignments shared by the website and email. Keep this order and the hash
 * stable for drafts and unknown slugs that do not yet have an assignment.
 * Accent is for marks/decoration; ink is for normal-size text.
 */
export const TIDBITS_PALETTES = [
  {
    id: 'verdigris',
    accent: '#1f7a74',
    ink: '#125e59',
    paper: '#e8f1ee',
    dark: '#79c7bb',
    foreground: '#ffffff',
  },
  {
    id: 'ochre',
    accent: '#b87912',
    ink: '#765000',
    paper: '#f6efdd',
    dark: '#e3b55a',
    foreground: '#111110',
  },
  {
    id: 'cobalt',
    accent: '#2f61b5',
    ink: '#254a88',
    paper: '#e9eef7',
    dark: '#8daced',
    foreground: '#ffffff',
  },
  {
    id: 'aubergine',
    accent: '#8c4d87',
    ink: '#663361',
    paper: '#f2eaf0',
    dark: '#c89fc4',
    foreground: '#ffffff',
  },
  {
    id: 'persimmon',
    accent: '#d16a27',
    ink: '#8f3f13',
    paper: '#f7ece4',
    dark: '#f0a06f',
    foreground: '#111110',
  },
] as const

export type TidbitsPalette = (typeof TIDBITS_PALETTES)[number]
export type TidbitsPaletteId = TidbitsPalette['id']

export const TIDBITS_PALETTE_ASSIGNMENTS: Readonly<Record<string, string>> =
  savedAssignments

/** Saved issue identity, with the original FNV-1a fallback for unpublished slugs. */
export function tidbitsPaletteForPost(slug?: string): TidbitsPalette {
  if (!slug) return TIDBITS_PALETTES[0]
  const saved = TIDBITS_PALETTES.find(
    (palette) => palette.id === TIDBITS_PALETTE_ASSIGNMENTS[slug]
  )
  if (saved) return saved
  let hash = 2166136261
  for (let index = 0; index < slug.length; index++) {
    hash = Math.imul(hash ^ slug.charCodeAt(index), 16777619)
  }
  return TIDBITS_PALETTES[(hash >>> 0) % TIDBITS_PALETTES.length]
}

export function tidbitsAsset(
  palette: TidbitsPalette,
  kind: 'wordmark' | 'icon' | 'email' | 'email-dark'
): string {
  const extension = kind.startsWith('email') ? 'png' : 'svg'
  return `/images/tidbits-palettes/${palette.id}-${kind}-v2.${extension}`
}

function paletteVariables(palette: TidbitsPalette): string {
  return `--tidbits-accent:${palette.accent};--tidbits-ink:${palette.ink};--tidbits-paper:${palette.paper};--tidbits-dark:${palette.dark};--tidbits-foreground:${palette.foreground}`
}

/**
 * Rendered in the head, before paint. The root default follows the latest issue;
 * an individual post overrides it for the whole document, including the header
 * and portaled dialogs. CSS :has updates atomically on Next.js navigation and
 * back/forward, with no hydration effect, storage, or color-flash script.
 */
export const TIDBITS_PALETTE_CSS = [
  `:root{${paletteVariables(TIDBITS_PALETTES[0])}}`,
  ...TIDBITS_PALETTES.map(
    (palette) =>
      `:root[data-tidbits-default="${palette.id}"]{${paletteVariables(palette)}}`
  ),
  ...TIDBITS_PALETTES.map(
    (palette) =>
      `:root:has(main [data-tidbits-palette="${palette.id}"]){${paletteVariables(palette)}}`
  ),
].join('\n')
