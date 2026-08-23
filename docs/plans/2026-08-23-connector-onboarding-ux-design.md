# Connector Onboarding UX Refinement

## Goal

Make MCP connector onboarding understandable without MCP implementation knowledge and keep every required action and error visible inside the desktop panel.

## Product decisions

1. The normal path is provider template or official `mcpServers` JSON, not the low-level connector form.
2. Opening either path uses one focused onboarding layer instead of expanding a long form inside the connector list.
3. The flow has two stages: paste/edit JSON, then review detected services and provide only missing credentials.
4. After preview, the large JSON editor is hidden. Users can return to edit it from the review footer.
5. Credential labels use provider placeholders such as `GITHUB_PERSONAL_ACCESS_TOKEN`; internal `DSH_CONNECTOR_*` references are never presented as user input names.
6. Save remains disabled until at least one server is selected and every selected server has its missing credentials. The footer explains what remains.
7. Import failures are shown inside the onboarding layer and in an always-visible panel toast. Missing input receives focus.
8. The existing custom connector form remains under an explicit advanced entry for development and unsupported providers.

## Layout and interaction

The connector list remains the background surface. Template or JSON import opens a contained dialog in the panel content area. The dialog owns a fixed header, a scrollable body, and a fixed footer. This prevents the action area from disappearing below long JSON or multi-server previews.

The JSON stage contains the provider JSON editor and security note. The review stage contains compact server cards, service selection, endpoint summary, and credential inputs. Conflict handling stays in the footer because it is an import-level option rather than a server field.

The extension panel uses border-box sizing and an absolutely positioned toast host so bottom padding cannot push feedback outside the visible container.

## Error and accessibility behavior

- JSON parsing errors appear in a `role="alert"` banner within the dialog.
- Global failures use `role="alert"`; successful notifications use `role="status"`.
- Required credential inputs have stable labels, `required`, and `aria-invalid` when submission identifies a missing value.
- Escape-equivalent close remains available as a visible button; closing clears transient JSON, credentials, selection, and errors.
- All controls retain keyboard focus states and use the active DSH design tokens.

## Verification

- Pure tests cover selected server extraction, credential labels, missing credential detection, and duplicate credential slots.
- Component source is typechecked and bundled.
- Existing extension-center and desktop connector/IPC tests remain green.
- Visual structure is checked at constrained panel height to confirm the footer and errors remain visible.
