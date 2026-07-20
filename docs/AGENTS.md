# FishyStream repository instructions

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
