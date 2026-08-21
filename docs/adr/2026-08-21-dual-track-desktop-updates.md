# ADR: Separate desktop application updates from official DSH runtime updates

## Status

Accepted

## Context

Harness Design Desktop ships two independently versioned products: the Electron desktop application and the embedded DeepSeek Harness runtime. Updating either one can fail for different reasons and requires different recovery behavior. Users should not need to understand this distinction to keep the application current, but advanced users still need controlled official-runtime upgrades.

The public release must support Windows x64, macOS x64, and macOS arm64. GitHub Releases is the distribution origin. macOS background installation additionally requires a Developer ID signature and notarization; unsigned development builds can still detect releases and direct users to the release page.

## Decision

Use two update managers and two IPC namespaces:

- Desktop application updates use `electron-updater`, GitHub Releases metadata, and `app-updates:*` IPC channels. Automatic download is opt-in after a version prompt. A downloaded update is installed only after explicit confirmation.
- Official DSH runtime updates retain the existing isolated download, profile backup, health check, and rollback flow under `updates:*`.
- Release automation builds Windows x64 and both macOS architectures, publishes checksums and updater metadata, and never publishes from an unverified build.
- The application menu and extension dock label the two update types separately.

## Consequences

### Positive

- Users receive normal application-version notifications without seeing npm package details.
- Official runtime changes cannot silently replace the desktop application.
- Platform artifacts and checksums are reproducible from tags.
- Signing can be added through repository secrets without redesigning the updater.

### Negative

- The release pipeline is slower because three architecture-specific packages must be verified.
- Seamless macOS installation remains unavailable until Developer ID signing and notarization are configured.
- The update UI has two status domains to explain clearly.

## Alternatives Considered

- Treat the DSH runtime version as the desktop version: rejected because UI and native desktop fixes would not map to official runtime releases.
- Replace the complete application whenever official DSH changes: rejected because it removes runtime rollback and makes upstream compatibility failures user-facing.
- Poll GitHub manually without `electron-updater`: rejected because it would reimplement metadata validation, differential downloads, and installer coordination.

## References

- https://www.electron.build/docs/features/auto-update/
- https://docs.github.com/actions/reference/runners/github-hosted-runners
