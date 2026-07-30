# FishyStream repository instructions

## AI Context & Design System Documentation

All AI context, product specifications, and design system rules reside in the `docs/` directory:

- **Product Specifications**: `docs/PRODUCT.md`
- **Design System & Tokens**: `docs/DESIGN.md`
- **Impeccable Sidecar Metadata**: `docs/.impeccable/design.json`

AI agents should read `docs/PRODUCT.md` and `docs/DESIGN.md` before making UI/UX modifications or adding new features.

## Validation

- Use `bun run lint` as the standard validation command.
- Do not run the Android build, Capacitor sync, or web production build during normal work.
- Only run Android or web builds when the user explicitly requests a build or release check.

## UI components

- Use the `@fishy/ui` component library throughout the app.
- Do not use native HTML buttons, inputs, dialogs, or other default controls when an equivalent `@fishy/ui` component exists.
- Extend or style `@fishy/ui` components rather than replacing them with custom React controls.

## Dont do's

- dont use cmds in node_modules
