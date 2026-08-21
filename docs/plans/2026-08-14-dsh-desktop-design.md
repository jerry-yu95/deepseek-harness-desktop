# DeepSeek Harness Desktop Design

## Objective

Turn the existing DeepSeek Harness Web experience and this repository's complete plugin and skin collection into a Windows EXE without reimplementing or forking the official DSH application. Preserve the user's sessions, profiles, skills, plugins, settings, mobile remote control, SSH tools, task board, Git graph, previews, statistics, pets, and skins while adding desktop lifecycle and extension management.

## Constraints

- Use only the official `@deepseek-ai/*` NPM runtime and SDK packages. Do not modify or vendor a DSH source checkout.
- Preserve all current repository plugins and skins as independent Cordis bundles.
- Do not overwrite the user's existing DSH home or web profile.
- Build an unsigned Windows installer and portable EXE locally. Code signing remains optional because no signing certificate is available.
- Keep the architecture portable to macOS and Linux, but make Windows the release target for version 1.
- Keep Electron renderer pages isolated from Node and operating-system privileges.

## Options Considered

### Electron with an embedded official DSH runtime

Electron supplies the same Chromium class of browser environment used by the Web UI and a compatible Node runtime for the DSH host process. The desktop main process starts the official DSH CLI against a dedicated desktop profile and loads its loopback URL. This is the selected option because it preserves browser behavior, Node plugins, SSH native dependencies, and the official profile model with the fewest compatibility boundaries. The cost is a larger installer.

### Tauri with a Node sidecar

Tauri produces a smaller shell, but DSH still needs a complete Node sidecar and native NPM dependencies. The application would then carry WebView2, Rust IPC, and Node lifecycle boundaries at once. It provides little practical size advantage after the sidecar is included and increases plugin compatibility and diagnostics risk.

### Installable PWA

A PWA would be simple and small, but it is not a self-contained EXE and cannot own the DSH host lifecycle, native menus, file integration, extension installation, or robust process recovery. It does not meet the desktop requirement.

## Architecture

The new `apps/dsh-desktop` workspace contains an Electron main process, a narrow preload bridge, a local startup surface, and an extension-center surface. The desktop package depends on the official `@deepseek-ai/dsh` package and the local `@deepseek-ai/dsh-web-ui-all` aggregate bundle. Existing plugins remain unchanged.

At startup, the app acquires a single-instance lock, resolves a dedicated DSH home under Electron's user-data directory, and creates a `desktop` profile if it is absent. The profile stacks `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, and `@deepseek-ai/dsh-web-ui-all`. A runtime package linker makes the bundled workspace packages resolvable from that profile without downloading them or changing the user's ordinary `web` profile.

The runtime controller launches the official DSH CLI with `--profile desktop --port 0`. It parses only the official `dsh web: http://127.0.0.1:<port>` readiness line, verifies that the URL is loopback HTTP, then navigates the main BrowserWindow to it. Output is streamed to a bounded log file and the startup surface. Shutdown first sends a graceful signal and escalates after a timeout. Unexpected exits use bounded exponential restart with a visible recovery action.

## Desktop Security Boundary

The DSH Web renderer uses `contextIsolation`, `sandbox`, and no Node integration. The preload bridge exposes only application version, platform, runtime status, safe folder-opening operations, extension queries, and validated extension mutations. Top-level navigation is limited to the active loopback DSH origin. External HTTPS links open in the system browser; arbitrary popups, permission requests, non-loopback HTTP, and dangerous URL schemes are denied.

IPC handlers validate every payload. Plugin installation accepts NPM package specs rather than shell strings and invokes a fixed bundled package-manager entry point with an argument array. Skill import requires a real directory containing one top-level `SKILL.md`, validates frontmatter name shape, rejects links that escape the selected directory, and copies into the user's skill root without overwriting an existing skill.

## Extension Center

The extension center complements the official Web settings rather than replacing them. Its plugin tab shows built-in bundles plus community dependencies in the desktop profile, supports installing or removing a community NPM bundle, and clearly indicates when a runtime restart is required. Built-ins cannot be removed accidentally.

The skills tab scans the official DSH roots: project `.dsh/skills`, project `.agents/skills`, user `.dsh/skills`, user `.agents/skills`, and configured custom roots when present. It reports invalid or shadowed entries, opens their directories, and imports a validated one-level skill bundle. File watchers in the official DSH skill provider keep the running catalog current.

## Data and Compatibility

The desktop runtime uses the user's normal home directory for credentials, model settings, workspace data, SSH configuration, and global skill roots. Only the profile manifest, runtime logs, window state, and desktop-specific settings live under the Electron user-data directory. This separation prevents the EXE from mutating or breaking the existing command-line `web` profile while preserving the user's existing data and skills.

Built-in plugin versions are pinned by the lockfile. Community plugin installs modify only the desktop profile. A repair action can rebuild generated profile links from packaged resources without touching sessions or credentials.

## Performance

The app runs one Chromium renderer and one DSH host process, with no duplicate Web frontend or proxy layer. It uses an operating-system-assigned loopback port, a single app instance, lazy creation of the extension center, bounded logs, persisted window geometry, Chromium code caching, and GPU acceleration left enabled. The startup surface is static and dependency-free. Runtime readiness is event-driven from stdout rather than polling.

Build output uses an ASAR for application code while unpacking only modules that require filesystem or native-binary access. Source maps and development dependencies are excluded from release artifacts. The release pipeline records installer size, cold-start time, ready time, and idle memory so regressions are measurable.

## Error Handling

The startup surface distinguishes profile bootstrap errors, missing runtime packages, port or bind failures, plugin load failures, and unexpected host exits. It shows sanitized recent logs and offers retry, profile repair, log-folder open, and exit actions. Failures never silently fall back to a remote origin.

Plugin and skill operations are serialized per profile, return structured errors, and preserve the previous profile manifest on failure. Profile writes use a temporary file followed by atomic rename. The application writes no authentication token to logs.

## Testing and Release

Pure Node tests cover URL validation, readiness parsing, profile generation, package linking, process state transitions, plugin-spec validation, skill discovery and import guards, log rotation, and window-state normalization. Electron smoke tests launch the development app against an isolated temporary DSH home and verify startup, main navigation, extension-center access, restart, and shutdown. The release build is installed and launched on Windows, then the original DSH functions are checked against a feature-preservation matrix.

The repository will include bilingual desktop documentation, architecture notes, contributor and security guidance, a changelog, issue templates, release notes, screenshots, and a reproducible GitHub Actions Windows build. Publication uses a new public repository under the authenticated GitHub account because the current upstream repository is read-only for that account. Promotion includes an optimized GitHub description and topics, a tagged GitHub release, a launch article, and ready-to-post Chinese and English social copy.
