# dialog

2026-07-07. Migrated the local shadcn dialog wrapper from Radix Dialog to Base UI Dialog. Verdict: code builds against Base UI while preserving the existing public wrapper API.

## Changed

- `src/components/ui/dialog.tsx`: replaced `@radix-ui/react-dialog` with `@base-ui/react/dialog`, mapping `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, and `Close` to the existing exports.
- `src/components/ui/dialog.tsx`: kept Radix-style `asChild` compatibility for local callers by translating it to Base UI's `render` prop.
- `src/components/ui/dialog.tsx`: changed animation selectors from Radix `data-state` classes to Base UI `data-starting-style` and `data-ending-style` selectors.
- `package.json` and `pnpm-lock.yaml`: replaced `@radix-ui/react-dialog` with `@base-ui/react`.
- `src/app/layout.tsx`: added `relative isolate` to the root body for Base UI portal stacking guidance.

## Left alone

- `components.json`: left `style: new-york` in place. The current shadcn CLI rejects an explicit `base` field, and switching to a base-prefixed preset would rewrite this site's component styling contract instead of just changing the headless primitive.
- Dialog call sites: left existing imports and `DialogClose asChild` usage in place because the wrapper preserves that API.

## Behavior changes

- Base UI uses `Backdrop` and `Popup` instead of Radix `Overlay` and `Content`.
- Base UI composition uses `render` instead of `asChild`; the wrapper handles the existing `asChild` cases.
- Enter and exit animation data attributes changed. Visual styling is intended to remain equivalent.

## Verify by hand

- Open the sign-in modal, close it with the close button, backdrop, and Escape.
- Open account and unsubscribe delete confirmations, then tab through controls and close.
- In Printing press, open the send, subscriber delete, suppression clear, and click-to-call confirmations.
