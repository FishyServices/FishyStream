# Repository instructions for AI agents

Read the relevant document before changing the matching part of the repository:

- Product behaviour and scope: [docs/PRODUCT.md](docs/PRODUCT.md)
- Domain terms and ownership: [docs/CONTEXT.md](docs/CONTEXT.md)
- Visual rules and tokens: [docs/DESIGN.md](docs/DESIGN.md)
- Module map and seams: [docs/architecture/README.md](docs/architecture/README.md)

- Do not preserve backwards compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstraction, configuration, and indirection.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types
- Do not run commands from `node_modules`.

## Validation

- Use `bun run lint` as the standard validation command.
- Do not run the Android build, Capacitor sync, or web production build during normal work.
- Only run Android or web builds when the user explicitly requests a build or release check.

## UI components

- Use the `@fishy/ui` component library throughout the app.
- Do not use native HTML buttons, inputs, dialogs, or other default controls when an equivalent `@fishy/ui` component exists.
- Extend or style `@fishy/ui` components rather than replacing them with custom React controls.
