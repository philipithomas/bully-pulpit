# sheet

2026-07-07. Migrated the local shadcn sheet wrapper from Radix Dialog to Base UI Dialog. Verdict: the wrapper now uses Base UI while keeping the existing left-side default and exported API.

## Changed

- `src/components/ui/sheet.tsx`: replaced `@radix-ui/react-dialog` with `@base-ui/react/dialog`.
- `src/components/ui/sheet.tsx`: mapped `Overlay` to Base UI `Backdrop` and content to Base UI `Popup`.
- `src/components/ui/sheet.tsx`: kept `asChild` compatibility for triggers and close controls by translating it to Base UI's `render` prop.
- `src/components/ui/sheet.tsx`: changed slide animation selectors from Radix `data-state` classes to Base UI `data-starting-style` and `data-ending-style` selectors.
- `src/components/ui/sheet.tsx`: added the standard header, footer, title, description, overlay, and portal exports for future sheet usage.

## Left alone

- The default `side` remains `left` to preserve existing local behavior.
- No call sites currently import `Sheet`, so no app screens needed usage edits.

## Behavior changes

- Base UI uses `Backdrop` and `Popup` instead of Radix `Overlay` and `Content`.
- The sheet now supports `top`, `right`, `bottom`, and `left` side values, while retaining the previous `left` default.

## Verify by hand

- When a sheet call site is added, check open and close with click, Escape, and keyboard tab order.
- Check left and right side animations in a small viewport.
