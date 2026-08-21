# Channel Bots Implementation Plan

> **For Codex:** This is the validated design for the desktop channel Gateway implementation.

**Goal:** Add reliable text-channel control for Feishu, WeCom, and WeChat iLink without exposing the DSH loopback server or duplicating agent-session logic per platform.

**Architecture decision:** Use the existing community plugin `@xmanrui/dsh-im@0.7.1` instead of maintaining a second channel gateway in `dsh-remote-web-ui`. It already provides Feishu, Weixin iLink, WeCom, QQ, DingTalk, Telegram, Discord, Slack, and WhatsApp adapters, QR/manual provisioning, DSH credential-provider storage, per-bot workspaces, reconnection, streaming, and channel-specific RPC settings. The desktop repository carries it through the small `@linxin666/dsh-im-bundle` carrier and pins the dependency in the desktop Profile. `dsh-remote-web-ui` remains responsible only for mobile remote control.

**Tech Stack:** TypeScript, Cordis host plugin lifecycle, DSH `ApiProxy.sessions` and `ApiProxy.events.mux`, official Feishu Node SDK Channel/WebSocket client, official WeCom AI Bot Node SDK, native `fetch` for the WeChat iLink HTTP API.

---

## Decisions

1. Feishu uses the official long-connection Channel API, so a public callback URL is not required.
2. WeCom uses the AI Bot WebSocket mode, not the legacy group Webhook. The latter is outbound-only and cannot receive user commands.
3. WeChat is implemented against the iLink Bot protocol used by the current OpenClaw connector. Login/QR acquisition is kept as a separate credential bootstrap step; the Gateway only consumes a locally stored token and never prints it to logs or the UI.
4. DSH sessions are created lazily per conversation and prompts are queued. One conversation is processed serially; different conversations may run concurrently.
5. A channel is opt-in: no adapter starts unless its complete credential set is present and the user has enabled that channel. Invalid or missing credentials produce a visible disabled/error status, not a crash loop.

## Security boundaries

- Never expose app secrets, bot secrets, bearer tokens, or iLink authorization values through IPC, `/api/pair/status`, logs, QR links, or diagnostics.
- Apply per-channel sender allowlists before creating or prompting a DSH session.
- Bound inbound text and outbound reply sizes; split platform messages at safe UTF-8 boundaries.
- Deduplicate provider message IDs before prompting DSH; retrying a transport must not replay a user command.
- Keep the DSH agent’s existing permission/profile policy. A channel message is only another text prompt; it does not gain host-admin APIs.

## Delivery sequence

1. Add adapter and gateway contracts with in-memory fake adapters.
2. Add durable conversation mapping and idempotency storage with atomic writes.
3. Add Feishu and WeCom adapters behind optional dependencies/configuration.
4. Add the WeChat iLink polling adapter and explicit token configuration.
5. Add status/configuration surface and redacted diagnostics.
6. Test fake transports, session bridge, reconnect/dedupe behavior, and real route startup; then build the arm64 DMG.
