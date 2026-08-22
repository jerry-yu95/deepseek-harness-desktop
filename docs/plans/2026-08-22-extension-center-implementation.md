# Extension Center - Implementation

## Package layout (packages/dsh-extension-center)

- `package.json` - `@linxin666/dsh-client-ui-extension-center`, client-only
  manifest (`dsh.client.inject: @deepseek-ai/dsh-client-runtime`, platform
  web), scripts: build (tsdown), typecheck (tsc), test (vitest).
- `tsdown.config.ts` - shared `clientBundle` preset, node entry
  `src/index.ts` only (no host behavior).
- `cordis.patch.yml` - `- id: extension-center` insert row.
- `src/index.ts` - host loader no-op (dsh-web-ui-settings pattern).
- `src/client/index.ts` - `apply(ctx)`: register locale dictionaries, build
  the controller, mount sidebar entries + panel, dispose on ctx teardown.
  Mount failures log, never throw.
- `src/client/locales.ts` - zh key source + en mirror + `t()` interpolator.
- `src/client/helpers.ts` - dictionary pick by document language, `tt()`,
  `errorMessage()`.
- `src/client/bridge.ts` - typed `DesktopBridge` surface, availability probe,
  pure form mappers (`splitComma`, `splitLines`, `buildConnectorInput`,
  `buildSkillInput`, `connectorEndpoint`).
- `src/client/sidebar-entry.ts` - two rows (skills, connectors), placement
  after the New Session row, self-healing observers, per-tab active state.
- `src/client/mount.tsx` - panel container in the conversation column, html
  attribute toggling.
- `src/client/panel/controller.ts` - framework-free state owner
  (`{ panelOpen, tab }`, `open(tab)`, `toggle(tab)`).
- `src/client/panel/ExtensionPanel.tsx` - header, tabs, desktop-only notice,
  toast host.
- `src/client/panel/SkillsTab.tsx` - skill list + Skill Studio form +
  import + open skill root (ports the dock logic).
- `src/client/panel/ConnectorsTab.tsx` - connector list + form (kind /
  transport dependent fields) + health check + remove (ports the dock logic).
- `src/client/panel/panel.module.css` - `--dsw-*` tokens, conversation
  takeover rules, entry rows.
- `tests/bridge.test.ts` - vitest pure-logic suite.

## Wire-ups

1. `apps/dsh-desktop/src/profile.mjs`: append
   `@linxin666/dsh-client-ui-extension-center` to `BUILTIN_RUNTIME_PACKAGES`.
2. `packages/dsh-web-ui-all/aggregate.yml`: add `../dsh-extension-center` to
   `patchFrom` and `deps`.
3. `node scripts/aggregate.mjs` regenerates the aggregate patch/package
   manifest; `aggregate:check` must pass.
4. `pnpm install` refreshes the workspace lockfile links.

## Verification sequence

1. `pnpm --filter @linxin666/dsh-client-ui-extension-center test`
2. `pnpm --filter @linxin666/dsh-client-ui-extension-center typecheck`
3. `pnpm --filter @linxin666/dsh-client-ui-extension-center build`
4. `pnpm -r test` (workspace gate incl. desktop profile tests)
5. `node scripts/aggregate.mjs --check`
6. Manual desktop acceptance afterwards: sidebar entries visible, tabs work,
   create-skill and add-connector flows mirror the dock.

## Release

- CHANGELOG 0.1.30 entry + workspace/desktop version bumps in the final
  commit of the batch.
