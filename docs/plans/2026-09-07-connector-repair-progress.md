# Connector repair progress

## Implemented

- Parse streaming MCP responses frame by frame and stop on the matching response, without waiting for EOF. Bound response size and cancel consumed streams.
- Forward the negotiated protocol version, session identifier and configured credential headers through tool discovery.
- Reject JSON-RPC errors, mismatched response identifiers, invalid tool schemas and empty tool lists.
- Explicit local command tests now use the MCP SDK for initialize and tools/list. Executable existence alone is not readiness. Draft tests still require local-command consent.
- Remove the default successful authorization probe placeholder.
- Separate saved configuration wording from connection success; do not promise that saving will complete authorization.
- Omit sensitive runtime lines containing common secret, cookie and argument shapes; omit URL addresses. This is defense in depth, not a guarantee for arbitrary unstructured output.

## Verification

- Desktop unit/integration suite: 229 passed, 0 failed.
- Extension center suite: 50 passed, 0 failed.
- Extension center TypeScript check: passed.
- git diff --check: passed.
- Added persistent SSE, positive and negative stdio MCP, header propagation and log redaction coverage.
- Tests used synthetic data and local fixtures only. No real provider account was accessed.

## Second batch: editor and interactive authorization

### Design and implemented behavior

- Both provider and custom connectors open a prefilled configuration editor. Credential fields display presence only; leaving them empty preserves the current encrypted value. Identity, provider association and header bindings remain intact.
- The main process accepts a limited set of editable fields and checks a revision fingerprint. A changed endpoint or command requires credential re-entry. Client-supplied credential references and unknown slots are rejected. Shared credentials cannot be silently changed for another connector.
- The remote authorization button uses the MCP SDK for discovery, dynamic client registration, PKCE and browser authorization. Callback state is verified, flows are cancellable and bounded to two minutes, and token requests do not follow redirects.
- OAuth grants are tested with initialize and tools/list before encrypted persistence and Harness reload. Failed discovery does not save the grant. Only safe health information crosses the renderer bridge.
- This interactive flow currently requires a provider supporting dynamic client registration. It does not implement persistent refresh tokens, automatic refresh, proprietary SSO or pre-registered client configuration. The UI explicitly asks users to reauthorize after expiration. Existing custom-header authentication remains available through configuration editing.
- Provider error bodies and authorization payloads are not returned to the renderer.

### Verification

- Desktop suite: 237 tests passed.
- Extension center: 52 tests passed; TypeScript check and build passed.
- The new OAuth test uses the actual MCP SDK with a local synthetic authorization server, including discovery, registration, state and PKCE exchange.
- IPC tests cover credential preservation/replacement and grant persistence only after MCP tool discovery.
- Electron source-build acceptance: 5 scenarios passed, including prefilled editor, save, reload and verification that only one connector remains. The fixture screenshot was visually reviewed.
- During deliberate runtime restarts, the test separately counts only expected HTTP/SSE/WebSocket disconnect messages; JavaScript exceptions and other console errors still fail acceptance. No real accounts are involved.
- Connector rows wrap actions and badges at narrow widths so the connector name cannot be squeezed out by the authorization button.

## Remaining work and release boundary

- Validate the particular authentication scheme used by each real provider. Standard OAuth support is not evidence that a proprietary SSO service is compatible.
- Automatic refresh and pre-registered OAuth clients remain follow-up work; current tokens require explicit reauthorization after expiry.
- Test readiness proves tool discovery, not successful loading into the live Harness tool registry or a real business operation.
- Real account acceptance requires user operation. Do not mark TAPD or iWiki verified based on these tests.
- No new DMG was generated in this batch. Installed applications and previous package artifacts remain unchanged.
- Isolated instances without a model key show onboarding again after runtime reload; this UX issue is recorded separately from connector readiness.
- Formal publication remains subject to user confirmation.
