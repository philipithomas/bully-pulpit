import {
  createHighlighterCore,
  type HighlighterCore,
  type ThemeRegistration,
} from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

/**
 * Build-time syntax highlighting for post code blocks. Highlighting happens
 * once during static generation (zero client JavaScript), so the highlighter
 * loads only the grammars the content actually uses.
 *
 * The theme is hand-built from the site palette in globals.css rather than a
 * stock editor theme: code sits on a light warm surface and reuses the three
 * newsletter accents, so blocks read as part of the page instead of a pasted
 * screenshot of someone's editor. The hex values mirror the CSS custom
 * properties (shiki cannot resolve var() at build time).
 */
export const codeThemeName = 'bully-pulpit'

const codeTheme: ThemeRegistration = {
  name: codeThemeName,
  type: 'light',
  // gray-075 surface, gray-800 body text: matches the .prose pre override.
  bg: '#eceae6',
  fg: '#3b3834',
  settings: [
    {
      settings: {
        background: '#eceae6', // gray-075
        foreground: '#3b3834', // gray-800
      },
    },
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: {
        foreground: '#7e7a73', // gray-500
        fontStyle: 'italic',
      },
    },
    {
      scope: ['keyword', 'keyword.control', 'storage.type', 'storage.modifier'],
      settings: {
        foreground: '#2b4a3e', // forest
      },
    },
    {
      scope: ['string', 'punctuation.definition.string', 'string.regexp'],
      settings: {
        foreground: '#6b4d3a', // walnut
      },
    },
    {
      scope: [
        'constant',
        'constant.numeric',
        'constant.language',
        'support.constant',
        'variable.other.constant',
      ],
      settings: {
        foreground: '#2c3e6b', // indigo
      },
    },
  ],
}

let highlighterPromise: Promise<HighlighterCore> | undefined

/**
 * Singleton highlighter shared across all statically generated pages in a
 * build worker. Grammars are limited to what posts use; an unrecognized
 * fence language falls back to plain text via the rehype plugin's
 * fallbackLanguage option in page.tsx rather than failing the build.
 */
export function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [codeTheme],
    langs: [
      import('shiki/langs/ruby.mjs'),
      import('shiki/langs/bash.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/tsx.mjs'),
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/yaml.mjs'),
      import('shiki/langs/json.mjs'),
    ],
    engine: createJavaScriptRegexEngine(),
  })
  return highlighterPromise
}
