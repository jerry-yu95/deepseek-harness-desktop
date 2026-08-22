# Extension Center (dsh-extension-center) - Design

## Problem

The Connector Center and Skill Studio shipped in 0.1.29 live only inside the
desktop Extension Dock window. Three user-facing issues surfaced during 0.1.29
acceptance:

1. Discoverability: the dock opens via the menu bar or Cmd+Shift+X only; the
   startup page and the DSH web UI expose no visible entry.
2. Style split: the dock is the desktop shell's own page; it never matches the
   official web UI design language.
3. Duplicate plugin lists: the dock's plugin tab (profile install level) and
   Settings > plugin configuration (runtime switches) read as two overlapping
   plugin lists.

## Decision

Move the Skills and Connectors surfaces into the official DSH web UI as a
client-only web UI plugin, `@linxin666/dsh-client-ui-extension-center`
(directory `packages/dsh-extension-center`):

- Sidebar entries (skills, connectors) injected at the DOM level after the New
  Session row, following the dsh-ssh precedent (self-healing MutationObserver,
  plain-DOM row, never disturbs shell reconciliation).
- A panel React root mounted as an extra trailing child of the conversation
  column, visibility toggled by an html data attribute - the dsh-ssh takeover
  pattern. Styling rides the official `--dsw-*` tokens, so themes and skins
  apply automatically.
- All privileged operations go through the existing desktop IPC bridge
  (`window.dshDesktop`, injected into the main window as well): skill
  list/create/import/open/openRoot, connector list/save/remove/check. The IPC
  handlers are unchanged.
- Outside the desktop (plain `dsh web` in a browser) `window.dshDesktop` is
  absent: the entries still appear, and the panel shows a desktop-only notice.

## Scope boundaries

- The Extension Dock keeps its Skills/Connectors tabs during the transition;
  they retire in a later release once the in-UI center is proven (batch A only
  adds, never removes).
- Plugin install management stays in the dock for now; converging it into
  Settings is a separate batch.
- No new IPC channels, no host-side (node) behavior: the host half is a no-op
  loader, mirroring dsh-web-ui-settings.

## Registration

- `cordis.patch.yml` inserts the plugin row (`id: extension-center`).
- Added to `BUILTIN_RUNTIME_PACKAGES` in the desktop profile so packaged builds
  mount it automatically.
- Added to `dsh-web-ui-all` aggregate (patchFrom + deps) via
  `scripts/aggregate.mjs`.

## Testing

- Pure-logic vitest suite for the bridge layer: comma/line list parsing,
  connector form-to-input mapping (stdio vs http field shapes), bridge
  detection with and without `window.dshDesktop`.
- Existing workspace checks (typecheck, build, aggregate consistency, desktop
  profile tests) must stay green.
