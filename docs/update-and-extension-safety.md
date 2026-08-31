# Official-core updates and extension safety

JIWEI separates three things that should not be upgraded as one blob:

1. The official `@deepseek-ai/dsh` runtime.
2. The desktop profile and community Cordis bundles.
3. User-owned settings, skills and session data under `DSH_HOME`.

The installer contains a known-good official runtime. A later official version is downloaded into the app user-data directory, never over the packaged copy and never into the desktop profile. Before switching, the updater copies the profile manifest, Cordis patch, lockfile and settings into a timestamped backup. It then validates the installed package and starts the runtime. If startup fails, the state pointer is rolled back and the previous runtime is restarted.

This protects user extensions from being overwritten. It cannot guarantee that every third-party extension is compatible with a new official API. Users should keep the previous runtime until their important plugins have been verified.

Mobile access remains provided by the bundled remote plugin. The official DSH server stays on loopback; personal-device mode starts an explicit Cloudflare quick tunnel only after confirmation, then uses the plugin's short-lived, one-time pairing token. Switching into this mode still restarts the official runtime once because the mode is supplied at process startup, but the connection intent is persisted across that restart. Tunnel readiness is non-terminal: the desktop keeps the panel open, reports the current runtime/tunnel diagnosis, and retries with backoff until the public route passes an end-to-end health check. Cloudflared preparation and public endpoint verification are bounded by hard timeouts, so a blocked download or edge handshake becomes an actionable retry state instead of an infinite loading screen. The desktop IPC only reports sanitized tunnel state and never returns pairing secrets. Users should revoke pairings they no longer use and avoid exposing the local port directly to the public internet.

This lifecycle follows the useful part of OpenClaw/Hermes channel integrations: a long-lived gateway owns connection state, connection failure is recoverable, and the UI does not lose the user's intent just because a process or network edge is restarting. The current desktop transport still uses the existing one-time QR plus Cloudflare tunnel; an outbound WebSocket relay/channel adapter for Feishu, WeCom, or WeChat is a separate follow-up and is not silently enabled by this build.

The GitHub source channel is intentionally staged in two steps. After checking the official repository, the Extension Dock can download an exact commit archive into `official-runtime/source-snapshots/<commit>` under Electron user data. The archive is size-limited, extracted into a temporary directory, and must contain a valid source `package.json` before the directory is published. Staging does not build or activate source code; the packaged/npm runtime remains active until a later isolated-build and health-check phase is completed.

The derivative retains the upstream BSD-3-Clause notices and does not modify the official DeepSeek Harness source tree. Integration is done through the public profile and plugin mechanisms.
