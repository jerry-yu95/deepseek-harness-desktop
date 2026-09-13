# JIWEI Engineering Stabilization Implementation Plan

> Execution follows the local writing-plans and Code skills. The user authorized this stabilization round; retain the existing working tree and do not commit, publish, change versions or operate real accounts.

**Goal:** Turn the verified knowledge/composer fixes into repeatable CI gates and a single understandable release-readiness record.

**Architecture:** Keep product behavior unchanged. Build the affected workspace packages before desktop tests consume their generated exports. Run synthetic Electron regressions on macOS and retain only fixture screenshots, geometry and aggregate results. Use the existing release report as the current status entry point and preserve dated evidence separately.

**Tech Stack:** pnpm, Node test runner, Vitest, Electron/Playwright, GitHub Actions, Markdown.

## Decisions

- Continue in the existing dirty checkout: its mixed fixes are the approved baseline. Separate review units in a manifest; do not rewrite history or pretend the groups are independently buildable commits.
- Prefer focused CI improvements over broad UI refactoring or a full monorepo overhaul. Existing three-platform unit checks remain; Electron regression initially runs on macOS arm64, matching the locally verified environment.
- Keep `0.1.44` as the source version and `0.1.45` as the unshipped target. Local pass, hosted CI pass, packaged pass and real-account pass are distinct facts.

## Task 1: Preserve and map the baseline

Read `AGENTS.md`, `.github/workflows/desktop-ci.yml`, the three acceptance scripts and both `docs/qa/0.1.45-*.md` records. Record HEAD, branch and dirty state. Create `docs/qa/2026-09-12-review-map.md` identifying knowledge core, reader, composer, connectors, generated outputs and CI/docs review units, including shared-file overlaps and dependencies.

## Task 2: Retain isolated E2E evidence

Create `apps/dsh-desktop/scripts/e2e-artifacts.mjs` with a shared artifact-directory allocator and `apps/dsh-desktop/test/e2e-artifacts.test.mjs`. Test explicit root, unique directories that preserve prior evidence, and unsafe suite names. Use `DSH_E2E_ARTIFACTS_ROOT` for CI, a fresh system temporary directory by default. Update knowledge/composer/acceptance scripts to use it and emit only safe aggregate result JSON. Preserve existing temporary-profile cleanup and keep screenshots out of profiles.

Validate with `node --test apps/dsh-desktop/test/e2e-artifacts.test.mjs`, followed by all three actual Electron scripts (composer both languages) using an explicit temporary evidence root. Inspect retained files; no raw profiles/configuration/provider responses are uploaded.

## Task 3: Wire the CI gates

Update `.github/workflows/desktop-ci.yml`: build and typecheck knowledge and extension-center, test both plus desktop on the existing three-platform matrix. Remove the duplicate connector test already included by desktop:test. Add a macOS Electron job with build prerequisite, sequential knowledge/composer zh/composer en/general acceptance steps and `always()` artifact upload. Later suites may run after a suite failure if the build succeeded; failures must still fail the job. Do not change release publishing triggers.

Parse YAML and inspect dependency/order/error semantics. Run the exact local build/test/E2E commands. Hosted workflow execution remains unverified until the changes are submitted and CI runs.

## Task 4: Unify readiness and contributor instructions

Update `docs/qa/0.1.45-release-report.md` and `docs/qa/0.1.45-acceptance-matrix.md` with current dated evidence, historical baselines, uncommitted-tree qualification, CI status, and pending package/live-account gates. Update `CONTRIBUTING.md` with the same build/test order and artifact instructions. Link the readiness report from README without claiming `0.1.45` is released.

## Task 5: Verify and hand off

Run affected package tests/typechecks/builds and actual Electron suites, YAML parsing, public-surface audit and `git diff --check`. Update this file with exact results and the review map with remaining boundaries. Stop at a reviewable local result; real-account trials and installer/release work remain separate tasks. A historical Task 0–12 completion does not imply every gate of the larger 0.1.45 release is passed.

## Execution status

Complete within the authorized local scope on 2026-09-12. No commit, push, dependency install, version change, packaging, release or real-account operation.

| Task | Result |
| --- | --- |
| 1 Baseline/review map | Preserved HEAD f4fd631 and all mixed edits; review map records seven groups and shared-file overlaps. |
| 2 Evidence retention | Shared unique directory helper, crash-tolerant diagnostic screenshots and three helper tests; all four Electron invocations wrote aggregate results outside profiles. Locale pinned for CI. |
| 3 CI gates | Existing Windows/macOS arm64/Intel unit matrix now builds and checks both packages before desktop tests. New macOS arm64 Electron job runs four suites; later suites run after earlier suite failure when build succeeds. No continue-on-error; PNG/JSON upload always attempted, seven-day retention. YAML parsed locally; hosted run NOT RUN. |
| 4 Readiness docs | Current report, historical/current matrix, review map, contributor commands and README entry updated. Source version remains 0.1.44. |
| 5 Local verification | Results below; all authorized local work complete. |

### Final local evidence

Host: macOS arm64, Node 22.22.3, pnpm 11.21.0. CI specifies Node 24, so the host and clean frozen-lockfile installation remain separate validation requirements. Existing dependencies were reused.

- Knowledge `typecheck`, `build`, `test`: passed, 85/85 tests.
- Extension Center `typecheck`, `build`, `test`: passed, 93/93 tests; local test output bounded with `DEBUG_PRINT_LIMIT=0`.
- Desktop `test`: 249/249 passed, including three artifact-helper tests. Total across affected packages: 427; not the full monorepo.
- Knowledge `test:knowledge:e2e`: 7/7 passed.
- Composer `test:composer:e2e` with `DSH_COMPOSER_PROBE=0`, separately `DSH_COMPOSER_LOCALE=zh` and `en`: 15/15 each, wide-row center deltas 0px.
- Desktop `test:acceptance`: 5/5 passed; 25 expected transport disconnects counted only during deliberate restarts.
- YAML unique-key parsing, workflow build/failure/upload order inspection, `pnpm audit:public` and `git diff --check`: passed.
- Public audit classifies both plans and QA as historical and skips them. Explicitly scanned this plan and the three updated QA documents using the same public-surface rules: zero findings. This is not a comprehensive security audit.
- Existing tsdown deprecation/module-type warnings remain; no build errors or SDK writes.

All Electron runs used `DSH_E2E_ARTIFACTS_ROOT=/private/tmp/jiwei-stabilization-evidence-U50W7H`. This temporary local evidence root contains only 46 PNG and six JSON files in four unique subdirectories:

- `jiwei-knowledge-reading-1hVlHy`: 13 screenshots and passed 7/7 result.
- `jiwei-composer-zh-B1G03D`: 16 screenshots, geometry and passed 15/15 result.
- `jiwei-composer-en-FibZ9z`: 16 screenshots, geometry and passed 15/15 result.
- `jiwei-acceptance-z2Q8OF`: final screenshot and passed 5/5 result.

Checked every result count and allowed file extension; inspected composer geometry. Opened knowledge capture, English narrow streaming draft and final connector screenshots. Local temporary evidence may expire; hosted CI artifacts are configured but no upload has occurred in this round.

### Remaining boundary

Hosted Node 24 CI, full monorepo coverage, Windows/Intel actual Electron UI, three-platform installers/update/rollback and live models/TAPD/iWiki/WeChat network remain unverified. Existing old generated store chunks were preserved, with active imports still targeting store-Q7PB7jnu.js. Stop here with a reviewable working tree; these local checks do not authorize publication or certify a release.
