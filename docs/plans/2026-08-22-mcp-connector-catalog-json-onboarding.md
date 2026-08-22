# MCP Connector Catalog and JSON Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a low-friction connector center where users paste official `mcpServers` JSON, replace only its token placeholders, validate the result, and connect it to DeepSeek Harness without exposing secrets or filling low-level MCP fields.

**Architecture:** Keep the existing `ConnectorStore` and official `@deepseek-ai/dsh-mcp-client` bridge as the Harness-facing execution layer. Add a canonical MCP JSON parser, an encrypted desktop-only credential store, a small preset catalog, and a three-surface UI: connector catalog, installed connectors, and advanced JSON/custom configuration. Normalize all imports into one connector record so future WorkBuddy, CodeBuddy, Trae, and Qoder adapters can reuse the same parser without entering the first release scope.

**Tech Stack:** Electron 43, Node.js ESM, React 18, TypeScript, Vitest, Node test runner, `@deepseek-ai/dsh-mcp-client`, Electron `safeStorage`, pnpm workspace.

---

## Product Decisions and Boundaries

1. The normal path is **paste/import official MCP JSON -> select server(s) -> replace detected placeholders -> connect**.
2. Do not ask normal users for connector IDs, transport names, commands, argument arrays, capability labels, environment-variable names, server addresses, organization IDs, or project scopes when those values already exist in the official JSON.
3. The current form remains available under **Advanced / Developer options**. It is not the default entry.
4. Presets contain verified official JSON templates and official documentation links; presets do not reimplement provider-specific account forms.
5. The first preset batch is GitHub, Feishu, and GitLab. Only publish a preset after its current official documentation and configuration have been verified. TAPD remains visible as a documented “not yet verified” entry until its official JSON template is stable; never invent a package or endpoint.
6. Import multiple entries from one `mcpServers` object. Allow the user to select which entries to install.
7. Never persist plaintext tokens in `connectors.json`, generated `cordis.patch.yml`, logs, crash diagnostics, exported JSON, React state after submission, or test snapshots.
8. Exported MCP JSON replaces secrets with `${ENV_NAME}` placeholders. It never exports secret values.
9. Phase 1 does not modify WorkBuddy, CodeBuddy, Trae, or Qoder configuration files. It establishes a canonical adapter boundary and generic `mcpServers` import/export so those clients can be integrated safely in a later phase.
10. Phase 1 supports transports already supported by official DSH rc.6: `stdio` and `streamable-http`. Unsupported SSE or provider-specific transports receive an actionable diagnostic and are not silently converted.

## User Flow and Acceptance Criteria

### Default connector flow

1. Open **连接器** and see **推荐连接器**, **已连接**, and **导入 MCP JSON**.
2. Choose a preset or paste official JSON.
3. The app previews server name, command/URL, transport, and detected credential placeholders.
4. The user enters only missing token values. Already-pasted secrets appear as “已检测到” and remain masked.
5. Click **保存并接入** once.
6. The app validates the JSON, encrypts secrets, stores only secret references in the connector registry, regenerates the desktop profile, and safely restarts Harness.
7. The installed card reports configuration validity, credential presence, command/URL reachability, and the last check time.

### Required acceptance evidence

- Official-style stdio JSON imports successfully.
- Official-style streamable HTTP JSON with an Authorization header imports successfully.
- Multiple `mcpServers` entries can be previewed and selectively installed.
- Invalid JSON identifies the error and does not restart Harness.
- Duplicate server names require an explicit Replace or Rename choice.
- A real token cannot be found with `rg` in the registry, generated profile, logs, or exported JSON after installation.
- Removing a connector removes its encrypted credential entries and generated profile entry.
- Existing connectors created by version 0.1.31 still load and remain usable.
- macOS arm64, macOS x64, and Windows x64 tests and package verification pass.

## Implementation status (2026-08-22)

The catalog, preview/import IPC, encrypted credential bindings, stdio argument secrets, and extension-center UI are implemented. The current verified preset set is GitHub, Feishu/Lark, and GitLab; TAPD is intentionally marked as awaiting an official JSON configuration. The advanced connector form remains available for providers without a verified preset.

Final verification for this batch: 87 desktop tests, 16 extension-center tests, extension-center typecheck, production build, and `git diff --check` all pass. The desktop suite includes a real official DSH Host startup and a main-process IPC test that verifies encrypted credential persistence and cleanup.

## Preflight: Preserve the Existing 0.1.31 Work

The current working tree already contains the 0.1.31 sidebar-controller fix and release changes. Do not begin connector work on top of an unidentified dirty tree.

**Step 1: Review the existing changes**

Run:

```bash
git status --short
git diff --check
git diff -- packages/dsh-extension-center/src/client/panel/controller.ts
```

Expected: only the known 0.1.31 release/controller changes and its new test are present; `git diff --check` prints nothing.

**Step 2: Run the existing focused tests**

Run:

```bash
pnpm --filter @linxin666/dsh-client-ui-extension-center test
pnpm --filter @harness-design/desktop test
```

Expected: all current tests pass before any new work begins.

**Step 3: Commit the 0.1.31 fix separately**

```bash
git add CHANGELOG.md package.json apps/dsh-desktop/package.json docs/launch/release-notes.md packages/dsh-extension-center/src/client/panel/controller.ts packages/dsh-extension-center/tests/controller.test.ts packages/dsh-extension-center/lib/client.js packages/dsh-extension-center/lib/client.js.map
git commit -m "fix: restore extension center sidebar navigation"
```

**Step 4: Create an isolated implementation branch/worktree**

Use a branch named `feat/mcp-json-connectors`. Do not mix this feature with unrelated user changes.

---

### Task 1: Define the Canonical MCP Import Contract

**Files:**
- Create: `apps/dsh-desktop/src/extensions/mcp-config.mjs`
- Create: `apps/dsh-desktop/test/mcp-config.test.mjs`
- Modify: `apps/dsh-desktop/src/extensions/connectors.mjs:5-63`

**Step 1: Write failing parser tests**

Cover these exact inputs:

```js
{
  "mcpServers": {
    "tapd": {
      "command": "npx",
      "args": ["-y", "@vendor/tapd-mcp"],
      "env": { "TAPD_TOKEN": "<YOUR_TOKEN>" }
    }
  }
}
```

```js
{
  "mcpServers": {
    "docs": {
      "type": "streamable-http",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ${DOCS_TOKEN}" }
    }
  }
}
```

Assert that `parseMcpServersJson(text)`:

- accepts only an object root with a `mcpServers` object;
- returns deterministic server previews in source order;
- preserves `command`, `args`, `url`, non-secret environment values, and header templates;
- identifies `<YOUR_TOKEN>`, `${DOCS_TOKEN}`, and credential-shaped literal values as secret slots;
- rejects `__proto__`, `constructor`, and `prototype` keys;
- rejects shell command strings represented as one concatenated command when no `args` array exists;
- rejects unsupported transports with `unsupported-mcp-transport:<name>`;
- never includes a detected literal token in `JSON.stringify(preview)`.

**Step 2: Run the test and verify failure**

```bash
pnpm --filter @harness-design/desktop test -- --test-name-pattern="MCP JSON"
```

Expected: FAIL because `mcp-config.mjs` does not exist.

**Step 3: Implement the parser and canonical types**

The normalized server shape is:

```js
{
  sourceName: 'tapd',
  suggestedId: 'tapd',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@vendor/tapd-mcp'],
  url: undefined,
  plainEnv: {},
  plainHeaders: {},
  secretSlots: [
    { location: 'env', targetKey: 'TAPD_TOKEN', credentialRef: 'DSH_CONNECTOR_TAPD_TAPD_TOKEN', template: '${secret}' },
  ],
}
```

Rules:

- Parse with `JSON.parse`; do not use `eval`, `Function`, YAML tags, or shell parsing.
- Generate IDs with lowercase kebab-case and resolve collisions in the UI, not silently in the parser.
- Classify keys matching `token|secret|password|api[_-]?key|authorization` as secret-bearing.
- Replace any detected literal secret immediately with an opaque slot; keep the value only in a separate transient `Map<credentialRef, value>` returned to the main process.
- Cap input at 1 MiB, 50 servers, 128 args per server, 128 env/header keys, and 8 KiB per scalar.

**Step 4: Extend connector records without breaking 0.1.31 data**

Add optional fields to validated MCP connector records:

```js
plainEnv: Record<string, string>
plainHeaders: Record<string, string>
secretBindings: Array<{
  location: 'env' | 'header'
  targetKey: string
  credentialRef: string
  template: '${secret}' | 'Bearer ${secret}'
}>
source: { kind: 'custom' | 'json' | 'preset', presetId?: string }
```

When reading old records, default these fields safely and retain `secretEnvKeys` compatibility until a later migration.

**Step 5: Run tests**

```bash
pnpm --filter @harness-design/desktop test
```

Expected: all desktop tests pass, including the new parser suite.

**Step 6: Commit**

```bash
git add apps/dsh-desktop/src/extensions/mcp-config.mjs apps/dsh-desktop/src/extensions/connectors.mjs apps/dsh-desktop/test/mcp-config.test.mjs apps/dsh-desktop/test/connectors.test.mjs
git commit -m "feat: normalize official MCP JSON configurations"
```

---

### Task 2: Add Encrypted Connector Credential Storage

**Files:**
- Create: `apps/dsh-desktop/src/extensions/connector-secrets.mjs`
- Create: `apps/dsh-desktop/test/connector-secrets.test.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs:1-350`
- Modify: `apps/dsh-desktop/src/runtime-controller.mjs:130-180`
- Modify: `apps/dsh-desktop/src/log-store.mjs:1-40`

**Step 1: Write failing secret-store tests**

Use injected `encrypt`, `decrypt`, and `isEncryptionAvailable` functions so tests do not access a real OS keychain. Verify:

- stored values are encrypted Base64 blobs, never plaintext;
- the file is atomically written and mode `0600` on POSIX;
- `setMany`, `has`, `resolveMany`, `removeMany`, and restart reload work;
- an unavailable encryption backend refuses persistent storage with `secure-storage-unavailable`;
- corrupt ciphertext fails closed and does not return partial secrets;
- environment output contains only generated credential references;
- dynamic `DSH_CONNECTOR_*` assignments are redacted from logs.

**Step 2: Run tests and verify failure**

```bash
pnpm --filter @harness-design/desktop test -- --test-name-pattern="connector secret"
```

Expected: FAIL because the secret store is missing.

**Step 3: Implement `ConnectorSecretStore`**

Store encrypted data at:

```text
$DSH_HOME/desktop/connector-secrets.json
```

Use Electron `safeStorage.encryptString()` and `safeStorage.decryptString()`. Persist only:

```json
{
  "version": 1,
  "entries": {
    "DSH_CONNECTOR_TAPD_TAPD_TOKEN": "<base64 encrypted bytes>"
  }
}
```

Do not expose a list-secrets IPC. Renderer-facing APIs may report only `{ configured: true|false }`.

**Step 4: Inject connector credentials only into the DSH Host launch**

Load decrypted connector references in the desktop main process and merge them into the environment assembled in `RuntimeController.start()`. Do not mutate the parent shell configuration and do not write values to `cordis.patch.yml`.

The generated MCP patch must map each target key/header to its generated reference, for example:

```yaml
env:
  TAPD_TOKEN: !!js process.env.DSH_CONNECTOR_TAPD_TAPD_TOKEN
headers:
  Authorization: !!js '`Bearer ${process.env.DSH_CONNECTOR_DOCS_AUTHORIZATION}`'
```

**Step 5: Verify secret redaction**

Add a test token such as `tapd-test-secret-987654`, save a connector, and assert it is absent from:

- `connectors.json`;
- `cordis.patch.yml`;
- desktop log output;
- exported JSON;
- thrown error messages.

**Step 6: Run tests**

```bash
pnpm --filter @harness-design/desktop test
```

Expected: all desktop tests pass.

**Step 7: Commit**

```bash
git add apps/dsh-desktop/src/extensions/connector-secrets.mjs apps/dsh-desktop/src/runtime-controller.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/src/log-store.mjs apps/dsh-desktop/test/connector-secrets.test.mjs apps/dsh-desktop/test/runtime-controller.test.mjs apps/dsh-desktop/test/log-store.test.mjs
git commit -m "feat: protect connector credentials at rest"
```

---

### Task 3: Render Complete MCP Configurations

**Files:**
- Modify: `apps/dsh-desktop/src/extensions/connectors.mjs:65-176`
- Modify: `apps/dsh-desktop/test/connectors.test.mjs`
- Modify: `apps/dsh-desktop/test/profile.test.mjs:89-170`

**Step 1: Add failing patch-generation tests**

Assert exact generated configuration for:

- stdio `command`, `args`, plain env, and secret env bindings;
- streamable HTTP `url`, plain headers, and `Bearer ${secret}` bindings;
- reconnect defaults and `failOnStartupError: false`;
- disabled connectors omitted;
- old 0.1.31 records still rendered identically;
- no plaintext token appears.

**Step 2: Run tests and verify failure**

```bash
pnpm --filter @harness-design/desktop test -- --test-name-pattern="MCP connectors render"
```

Expected: FAIL on env/header and binding assertions.

**Step 3: Implement deterministic rendering**

Keep `@deepseek-ai/dsh-mcp-client` as the only execution bridge. Emit `headers` for remote servers and preserve stable `serverName` values so tool names and KV-cache prefixes do not churn after restart.

**Step 4: Run profile and connector tests**

```bash
pnpm --filter @harness-design/desktop test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add apps/dsh-desktop/src/extensions/connectors.mjs apps/dsh-desktop/test/connectors.test.mjs apps/dsh-desktop/test/profile.test.mjs
git commit -m "feat: render authenticated MCP connector profiles"
```

---

### Task 4: Expose Safe JSON Import, Export, and Credential IPC

**Files:**
- Modify: `apps/dsh-desktop/src/extension-ipc.mjs:7-122`
- Modify: `apps/dsh-desktop/src/preload.cjs:11-22`
- Modify: `apps/dsh-desktop/test/ipc.test.mjs`
- Modify: `packages/dsh-extension-center/src/client/bridge.ts:25-105`
- Modify: `packages/dsh-extension-center/tests/bridge.test.ts`

**Step 1: Write failing IPC/bridge contract tests**

Add these methods:

```ts
previewMcpJson(text: string): Promise<McpImportPreview>
installMcpServers(input: McpInstallInput): Promise<{ installed: ConnectorRecord[] }>
exportMcpJson(ids?: string[]): Promise<string>
getConnectorCredentialStatus(id: string): Promise<Record<string, boolean>>
```

Verify the preload bridge exposes only these narrow operations and never exposes raw secret-store reads.

**Step 2: Run tests and verify failure**

```bash
pnpm --filter @harness-design/desktop test
pnpm --filter @linxin666/dsh-client-ui-extension-center test
```

Expected: contract tests fail because the methods do not exist.

**Step 3: Implement host-authoritative operations**

- Parse and validate JSON in Electron main, not only in React.
- Revalidate selected servers and secret values during install.
- Save connector records and secrets as one logical transaction; on failure restore both previous snapshots.
- Restart Harness once after the complete batch, not once per server.
- On removal, delete that connector's secret references before restarting.
- Export only placeholders.

**Step 4: Run tests**

```bash
pnpm --filter @harness-design/desktop test
pnpm --filter @linxin666/dsh-client-ui-extension-center test
pnpm --filter @linxin666/dsh-client-ui-extension-center typecheck
```

Expected: all tests and type checking pass.

**Step 5: Commit**

```bash
git add apps/dsh-desktop/src/extension-ipc.mjs apps/dsh-desktop/src/preload.cjs apps/dsh-desktop/test/ipc.test.mjs packages/dsh-extension-center/src/client/bridge.ts packages/dsh-extension-center/tests/bridge.test.ts
git commit -m "feat: add safe MCP JSON connector IPC"
```

---

### Task 5: Build the Connector Catalog and JSON Wizard

**Files:**
- Create: `packages/dsh-extension-center/src/client/panel/ConnectorCatalog.tsx`
- Create: `packages/dsh-extension-center/src/client/panel/McpJsonWizard.tsx`
- Create: `packages/dsh-extension-center/src/client/panel/InstalledConnectors.tsx`
- Create: `packages/dsh-extension-center/src/client/panel/AdvancedConnectorForm.tsx`
- Modify: `packages/dsh-extension-center/src/client/panel/ConnectorsTab.tsx:1-228`
- Modify: `packages/dsh-extension-center/src/client/panel/panel.module.css`
- Modify: `packages/dsh-extension-center/src/client/locales.ts`
- Create: `packages/dsh-extension-center/tests/mcp-json-wizard.test.tsx`

**Step 1: Add failing pure UI-state tests**

Test the wizard reducer/helpers without requiring a browser:

- paste -> preview;
- select/unselect multiple servers;
- mask discovered literal credentials;
- require only unresolved secret slots;
- duplicate ID -> Replace/Rename required;
- invalid JSON -> error and no install call;
- successful install -> clears transient values and reloads installed list.

If DOM interaction tests are introduced, configure a scoped jsdom test environment only for the new `.test.tsx` file; keep existing pure tests in Node.

**Step 2: Run tests and verify failure**

```bash
pnpm --filter @linxin666/dsh-client-ui-extension-center test
```

Expected: FAIL because the wizard does not exist.

**Step 3: Implement the three-level UI**

Default layout:

- **推荐连接器**: provider cards with status and official-doc link.
- **导入 MCP JSON**: primary action opening the paste/import wizard.
- **已连接**: status cards, Check, Export config, Reconnect/Replace, Disable, Remove.
- **高级设置**: collapsed section containing the existing custom form and raw JSON editor.

The raw editor should resemble the WorkBuddy concept but add validation, formatting, preview, and safe secret extraction before Save. Do not offer a Save button while the JSON is invalid.

Use existing `--dsw-*` tokens and extension-center CSS classes. Verify light, dark, and custom-image skins remain readable.

**Step 4: Add accessible behavior**

- keyboard-accessible tabs and dialogs;
- visible focus;
- `aria-live` install/check status;
- no token in DOM after submit;
- password inputs default to masked with a temporary reveal control;
- close/cancel clears transient tokens.

**Step 5: Run tests, typecheck, and build**

```bash
pnpm --filter @linxin666/dsh-client-ui-extension-center test
pnpm --filter @linxin666/dsh-client-ui-extension-center typecheck
pnpm --filter @linxin666/dsh-client-ui-extension-center build
```

Expected: all pass and `lib/client.js` is regenerated.

**Step 6: Commit**

```bash
git add packages/dsh-extension-center/src packages/dsh-extension-center/tests packages/dsh-extension-center/lib
git commit -m "feat: add MCP connector catalog and import wizard"
```

---

### Task 6: Add Verified GitHub, Feishu, and TAPD Presets

**Files:**
- Create: `apps/dsh-desktop/src/extensions/connector-catalog.mjs`
- Create: `apps/dsh-desktop/test/connector-catalog.test.mjs`
- Create: `docs/connectors/github.md`
- Create: `docs/connectors/feishu.md`
- Create: `docs/connectors/tapd.md`
- Modify: `apps/dsh-desktop/src/extension-ipc.mjs`
- Modify: `apps/dsh-desktop/src/preload.cjs`
- Modify: `packages/dsh-extension-center/src/client/bridge.ts`

**Step 1: Verify primary sources before coding each preset**

Use only the provider's official documentation or official GitHub organization/repository. Record in each connector document:

- source URL;
- verification date;
- official package/endpoint;
- exact official JSON shape;
- required token placeholder(s);
- supported transport;
- requested permission scopes;
- license and redistribution note.

Do not copy third-party package names into the built-in catalog without an explicit third-party badge and security review.

**Step 2: Write failing catalog tests**

Assert every enabled preset has:

- stable ID, localized name, official-doc URL, verification date;
- strict JSON that passes `parseMcpServersJson`;
- no secret literal;
- at least one explicit secret placeholder when authentication is required;
- supported transport only;
- no duplicate server ID.

**Step 3: Implement a data-only catalog**

The catalog must not execute remote code while browsing. Selecting a preset simply opens its verified JSON in the same import wizard. This keeps preset and custom JSON behavior identical.

**Step 4: Handle unavailable official MCP configurations honestly**

If current official GitHub, Feishu, or TAPD documentation does not provide a usable MCP JSON, include a disabled informational card with the official link and reason. Do not synthesize an unofficial connector merely to fill the catalog.

**Step 5: Run tests**

```bash
pnpm --filter @harness-design/desktop test
pnpm --filter @linxin666/dsh-client-ui-extension-center test
```

Expected: all tests pass and every enabled preset parses through the same production parser.

**Step 6: Commit**

```bash
git add apps/dsh-desktop/src/extensions/connector-catalog.mjs apps/dsh-desktop/test/connector-catalog.test.mjs apps/dsh-desktop/src/extension-ipc.mjs apps/dsh-desktop/src/preload.cjs packages/dsh-extension-center/src/client/bridge.ts docs/connectors
git commit -m "feat: add verified MCP connector presets"
```

---

### Task 7: Establish the Future Client-Adapter Boundary

**Files:**
- Create: `apps/dsh-desktop/src/extensions/mcp-adapters.mjs`
- Create: `apps/dsh-desktop/test/mcp-adapters.test.mjs`
- Create: `docs/adr/0010-external-mcp-client-adapters.md`

**Step 1: Write failing adapter tests**

Define this minimal interface:

```js
{
  id: 'generic-mcp-json',
  detect(): Promise<Array<{ path, readable, writable }>>,
  import(text): McpImportPreview,
  export(connectors): string,
}
```

Only implement `generic-mcp-json` now. Test deterministic placeholder-only export and round-trip normalization.

**Step 2: Document future adapters**

The ADR must specify that WorkBuddy, CodeBuddy, Trae, and Qoder adapters will:

- detect known config paths per OS;
- ask before reading or writing another application's files;
- create timestamped backups before writes;
- preserve unknown fields and comments where technically possible;
- never export or overwrite secrets silently;
- show a diff before applying;
- support one-way import first, bidirectional sync only after conflict semantics exist.

**Step 3: Run tests and commit**

```bash
pnpm --filter @harness-design/desktop test
git add apps/dsh-desktop/src/extensions/mcp-adapters.mjs apps/dsh-desktop/test/mcp-adapters.test.mjs docs/adr/0010-external-mcp-client-adapters.md
git commit -m "refactor: define external MCP client adapter boundary"
```

---

### Task 8: Add Integration, Security, and Regression Coverage

**Files:**
- Modify: `apps/dsh-desktop/test/runtime-integration.test.mjs`
- Modify: `apps/dsh-desktop/test/profile.test.mjs`
- Create: `apps/dsh-desktop/scripts/verify-mcp-connectors.mjs`
- Modify: `apps/dsh-desktop/package.json`
- Modify: `.github/workflows/ci.yml` (use the repository's actual workflow filename if different)

**Step 1: Add a fixture MCP server**

Create a test-only local MCP server that exposes one harmless `echo` tool. Do not download or execute a network package during tests.

**Step 2: Add end-to-end lifecycle coverage**

Test:

1. import JSON;
2. save encrypted credential;
3. generate profile;
4. launch real Host;
5. observe the fixture MCP server registration;
6. restart and reconnect;
7. remove connector;
8. confirm generated profile and secrets are removed.

**Step 3: Add static secret scans**

The verifier must scan unpacked app resources and test output for fixture tokens, private paths, unsupported client names, and accidental raw secret fields.

**Step 4: Run focused and complete test suites**

```bash
pnpm --filter @linxin666/dsh-client-ui-extension-center test
pnpm --filter @linxin666/dsh-client-ui-extension-center typecheck
pnpm --filter @linxin666/dsh-client-ui-extension-center build
pnpm --filter @harness-design/desktop test
pnpm -r test
```

Expected: every command exits 0.

**Step 5: Commit**

```bash
git add apps/dsh-desktop/test apps/dsh-desktop/scripts/verify-mcp-connectors.mjs apps/dsh-desktop/package.json .github/workflows
git commit -m "test: verify MCP connector lifecycle and secret safety"
```

---

### Task 9: Release 0.1.32 and Build All Supported Platforms

**Files:**
- Modify: `package.json`
- Modify: `apps/dsh-desktop/package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/launch/release-notes.md`
- Modify: `README.md`

**Step 1: Update release documentation**

Document:

- official JSON import workflow;
- encrypted credential behavior and limitations;
- preset verification policy;
- advanced custom connector location;
- unsupported transport diagnostics;
- future WorkBuddy/CodeBuddy/Trae/Qoder adapter scope.

Target version: `0.1.32`, assuming 0.1.31 is committed first.

**Step 2: Run formatting and test gates**

```bash
git diff --check
pnpm --filter @linxin666/dsh-client-ui-extension-center test
pnpm --filter @linxin666/dsh-client-ui-extension-center typecheck
pnpm --filter @linxin666/dsh-client-ui-extension-center build
pnpm --filter @harness-design/desktop test
pnpm -r test
```

Expected: no whitespace errors; all tests pass.

**Step 3: Build and verify packages**

Local macOS arm64:

```bash
pnpm --filter @harness-design/desktop pack:mac:arm64
pnpm --filter @harness-design/desktop pack:verify:mac:arm64
```

CI must build and verify:

- macOS arm64 DMG/ZIP;
- macOS x64 DMG/ZIP;
- Windows x64 NSIS installer.

Expected: package verifier confirms all managed runtime packages, extension-center bundle, connector catalog, and secret-safety verifier.

**Step 4: Manual acceptance pass**

On a clean profile:

1. install one stdio preset with a test token;
2. install one streamable HTTP JSON config;
3. import two servers in one JSON;
4. restart the app and verify both persist;
5. test dark, light, and custom-image themes;
6. export JSON and confirm placeholders replace tokens;
7. remove connectors and confirm credentials disappear;
8. run `rg` for the test tokens across `$DSH_HOME/desktop`, profile output, and logs; expect zero plaintext matches.

**Step 5: Commit and push only after acceptance**

```bash
git add package.json apps/dsh-desktop/package.json CHANGELOG.md docs/launch/release-notes.md README.md packages/dsh-extension-center/lib
git commit -m "release: prepare desktop 0.1.32"
git push origin feat/mcp-json-connectors
```

Do not tag or publish a GitHub Release until the three-platform CI matrix is green.

## Deferred Follow-up Stages

### Phase C: WorkBuddy / CodeBuddy / Trae / Qoder interoperability

Implement one adapter at a time, beginning with read-only import. Validate each client's current schema and config location from primary documentation or an installed local version. Add preview/diff/backup before any external write. Never assume all four clients use identical `mcpServers` semantics.

### Phase D: Additional presets

GitLab/腾讯工蜂, 企业微信, 钉钉, 腾讯会议, and other providers enter the same verified catalog. A provider preset is data plus documentation, not provider-specific UI code.

### Phase E: OpenAPI-to-connector import

Add OpenAPI import only after MCP JSON onboarding is stable. Keep it separate because OpenAPI describes HTTP operations, not MCP tool discovery, authentication lifecycle, or tool schemas.

## Definition of Done

This phase is complete only when:

- the normal user can connect an official MCP JSON by changing only token values;
- no plaintext secret is persisted or exported;
- the same canonical parser drives presets, pasted JSON, and future adapters;
- existing 0.1.31 connectors remain compatible;
- real Host integration proves at least one MCP tool is registered;
- all tests, package verification, and three-platform CI pass;
- documentation names unsupported cases instead of silently accepting them.
