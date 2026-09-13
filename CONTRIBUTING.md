# Contributing

Contributions to the desktop shell, plugins, skins, documentation, and tests are welcome.

## Development setup

Use Windows 10/11 or macOS, Node.js 24, and pnpm 11.21.0. Run from the repository root:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm desktop:dev
```

Before testing desktop integration, build the workspace packages it imports. The Desktop CI unit matrix runs these gates on Windows, macOS arm64 and macOS Intel:

```sh
pnpm --filter @harness-design/dsh-knowledge typecheck
pnpm --filter @harness-design/dsh-knowledge build
pnpm --filter @linxin666/dsh-client-ui-extension-center typecheck
pnpm --filter @linxin666/dsh-client-ui-extension-center build
pnpm --filter @harness-design/dsh-knowledge test
pnpm --filter @linxin666/dsh-client-ui-extension-center test
pnpm desktop:test
git diff --check
```

The synthetic Electron gate currently targets macOS arm64 with a graphical desktop and loopback access. It uses disposable profiles and a fixture model, without real account credentials. Run after the builds above:

```sh
export DSH_E2E_ARTIFACTS_ROOT="$(mktemp -d)"
export DSH_COMPOSER_PROBE=0
pnpm --filter @harness-design/desktop test:knowledge:e2e
DSH_COMPOSER_LOCALE=zh pnpm --filter @harness-design/desktop test:composer:e2e
DSH_COMPOSER_LOCALE=en pnpm --filter @harness-design/desktop test:composer:e2e
pnpm --filter @harness-design/desktop test:acceptance
```

Each invocation prints a unique evidence directory containing synthetic screenshots, aggregate `result.json` and, for composer, `geometry.json`. Without `DSH_E2E_ARTIFACTS_ROOT`, evidence goes to a fresh system temporary directory. Profiles are separate and removed on exit. CI retains only PNG/JSON evidence for seven days, including on failure; do not upload profiles or runtime logs. `DSH_COMPOSER_PROBE=1` collects measurements without layout assertions and is never acceptance evidence.

These are affected-package gates, not a full monorepo or packaged-app certification. See the [current readiness report](docs/qa/0.1.45-release-report.md) and [review map](docs/qa/2026-09-12-review-map.md) for scope and outstanding checks.

Build a local Windows installer with:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
pnpm desktop:pack
```

## Change expectations

- Preserve the integrated DSH Web surface and the upstream package composition where compatibility requires it; do not present upstream code as JIWEI-owned code.
- Add tests for lifecycle, profile, extension, security, or recovery behavior.
- Keep the Electron renderer sandboxed, context-isolated, and free of Node integration.
- Do not accept raw shell fragments, arbitrary URLs, or unvalidated filesystem paths over IPC.
- Do not commit credentials, API keys, Authorization headers, Cookies, local profiles, unsanitized `mcp.json` files, logs, or generated release directories.
- Do not paste credentials or private provider URLs into issues, pull requests, commit messages, screenshots, test fixtures, or documentation.
- Keep source, documentation, commit messages, and user-visible strings free of emoji.

Before submitting a change, run the gates above and `pnpm audit:public`. After separately authorized packaging, use the matching desktop verification command: `pack:verify` (Windows), `pack:verify:mac:arm64` or `pack:verify:mac:x64`. A passing source checkout does not certify an installer.
