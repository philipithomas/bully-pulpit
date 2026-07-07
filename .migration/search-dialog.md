# search dialog

2026-07-07. Migrated the custom search dialog from direct Radix Dialog usage to Base UI Dialog. Verdict: direct Radix imports are removed and the visual shell is preserved.

## Changed

- `src/components/search/search-dialog.tsx`: replaced direct `@radix-ui/react-dialog` imports with `@base-ui/react/dialog`.
- `src/components/search/search-dialog.tsx`: mapped `Overlay` to Base UI `Backdrop` and `Content` to Base UI `Popup`.
- `src/components/search/search-dialog.tsx`: changed animation selectors from Radix `data-state` classes to Base UI `data-starting-style` and `data-ending-style` selectors.
- `src/components/auth/sign-in-modal-lazy.tsx`: updated the lazy-load comment from Radix to Base UI.

## Left alone

- Search result rendering, keyboard active-descendant handling, analytics, and Bell handoff logic were not changed.
- Existing Biome warnings in this file around inline JSX handlers were left alone because they are unrelated to the primitive migration.

## Behavior changes

- Backdrop dismissal is now handled by Base UI rather than a full-screen content click handler.
- The visible popup is now the Base UI `Popup`, positioned directly at the same top offset and width as before.

## Verify by hand

- Open search from the header, type a query, use arrow keys and Enter on a result.
- Click outside the popup and press Escape to close.
- Use the "Ask Bell" row and confirm the chat sidebar opens with the query.
