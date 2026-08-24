# Long-Context Memory and Compaction Quality Benchmark Implementation Plan

> **For the execution model (5.6sol):** execute this plan task by task with TDD and review checkpoints. Do not replace or fork DeepSeek Harness compaction; test it through the official `ctx.compaction`, `ctx.tokenMeter`, session, and LLM seams.

**Goal:** Build a repeatable benchmark that proves whether long conversations retain critical facts, corrections, constraints, tool state, and pending work before and after one or more DeepSeek Harness compactions.

**Architecture:** Add a private, non-runtime workspace package named `@harness-design/dsh-context-bench`. It has two layers: a deterministic CI layer using the official compaction implementation with a fake DSH LLM adapter, and an opt-in live layer using a real configured DSH adapter. Both layers emit the same versioned JSON report and are scored by deterministic oracles first; model judging is optional and never the sole release gate.

**Tech Stack:** TypeScript, Vitest, Zod, Node.js, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-token-meter`, `@deepseek-ai/dsh-compaction`, `@deepseek-ai/dsh-compaction-basic`, and `@deepseek-ai/dsh-compaction-tool-result-pruner`.

---

## 1. Decisions and scope

### Recommended approach: hybrid benchmark

Use three execution tiers:

1. **Structural CI tier**: deterministic, no network, no credentials, under 90 seconds. It validates policy, event ordering, replacement ranges, retained tail, tool-call/result pairing, retry, cancellation, replay, pruning, and report scoring.
2. **Semantic smoke tier**: opt-in real model, normally 32K and 128K synthetic contexts. It validates recall and task continuation without paying for a million-token request.
3. **Full-capacity tier**: manual only, up to the adapter-reported context window. It is for release candidates or explicit investigations, never ordinary pull requests.

Rejected alternatives:

- **Only unit tests**: inexpensive but cannot measure summary quality or post-compaction memory.
- **Only live million-token tests**: too expensive, slow, noisy, and unsuitable as a stable CI gate.
- **Only model-as-judge evaluation**: subjective and vulnerable to judge drift; deterministic expected facts must remain authoritative.

### Non-goals for the first release

- Do not modify code under `node_modules` or any official `@deepseek-ai/*` package.
- Do not replace `@deepseek-ai/dsh-compaction-basic`.
- Do not add a product dashboard yet. Produce stable JSON and Markdown artifacts first.
- Do not upload prompts, summaries, API keys, workspace files, or credentials as public CI artifacts.
- Do not claim support for a provider whose adapter cannot report a valid context window.
- Do not add an automatic scheduled live run that consumes paid tokens.

### Repository safety

- The repository currently contains unrelated uncommitted release work. Before implementation, record `git status --short`; do not reset, stash, discard, or co-commit those changes without the owner's instruction.
- Keep all new implementation under `packages/dsh-context-bench`, plus the explicit root scripts, CI workflow, ignore rule, and benchmark documentation named in this plan.
- Preserve the repository rule that product-facing text and source contain no decorative emoji.

## 2. Benchmark contract

### Scenario matrix

Every fixture must contain machine-readable expected facts, negative facts, and weights. Implement at least these seven scenarios:

| ID | Scenario | Required behavior |
|---|---|---|
| `needle-position` | Critical IDs, numbers, names, and paths at early, middle, and late positions | All critical values survive; distractors do not replace them |
| `superseded-decisions` | A decision is changed two or three times | Latest decision is returned; stale values are rejected |
| `user-constraints` | Language, safety, formatting, and scope preferences | Active constraints survive verbatim or semantically equivalent |
| `coding-handoff` | Exact file paths, commands, errors, fixes, current work, and next step | Another agent can resume the correct next action |
| `tool-pairing` | Tool calls, results, long outputs, and unrelated distractors | No orphan calls/results; important head/tail evidence survives pruning |
| `multi-compaction` | Three consecutive compaction cycles with new facts between cycles | Earlier active facts remain, stale facts disappear, score degradation stays bounded |
| `bilingual-noise` | Chinese and English facts mixed with repetitive filler | Language mixing does not materially reduce recall |

Fixture source must be synthetic and contain no copied user conversation or repository secret.

### Mandatory metrics

Calculate these without a model judge:

- `criticalRecall`: weighted percentage of required facts present.
- `exactLiteralRecall`: exact paths, commands, IDs, error strings, and numeric values retained.
- `latestStateAccuracy`: latest value selected for mutable facts.
- `staleLeakage`: percentage of superseded values incorrectly retained as active.
- `constraintRecall`: active user constraints retained.
- `pendingWorkRecall`: pending jobs, current work, and next action retained.
- `toolIntegrity`: balanced tool calls/results and required evidence retained.
- `sectionCompleteness`: all official structured checkpoint sections present.
- `postCompactionPressure`: projected tokens divided by adapter context window.
- `compressionRatio`: shadowed token count divided by replacement-summary tokens.
- `multiCycleRetention`: score after each successive compaction.
- `cacheReadRatio`, summarization latency, input/output tokens, and estimated cost: informational only in the first release.

### Release gates

Deterministic tier must satisfy all of these:

- Structural invariants: 100%.
- Tool pairing and event adjacency: 100%.
- Retained-tail identity: 100%.
- Critical deterministic facts: 100%.
- Stale leakage: 0%.
- Replay result equality: 100%.
- Secrets in reports: 0 occurrences.

Live semantic tier initially uses these gates after at least three samples per scenario:

- Aggregate weighted score: at least 90.
- Critical fact recall: 100%.
- Exact literal recall: at least 95%.
- Latest-state accuracy: at least 95%.
- Stale leakage: at most 2% and never for a critical fact.
- Pending-work and constraint recall: at least 90%.
- Tool integrity: 100%.
- Three-cycle score: at least 85 with no single-cycle drop greater than 5 points.
- Successful compaction must reduce pressure below the configured threshold or return a classified no-safe-range result; silent overflow is a failure.

Do not make latency, provider cache ratio, or price a pass/fail gate until at least 20 comparable live samples establish a baseline.

## 3. File layout

Create this package:

```text
packages/dsh-context-bench/
  package.json
  tsconfig.json
  vitest.config.ts
  README.md
  src/
    cli.ts
    schema.ts
    corpus.ts
    oracle.ts
    scoring.ts
    report.ts
    runner/
      deterministic.ts
      live.ts
      official-harness.ts
      fake-adapter.ts
  fixtures/
    needle-position.json
    superseded-decisions.json
    user-constraints.json
    coding-handoff.json
    tool-pairing.json
    multi-compaction.json
    bilingual-noise.json
  tests/
    schema.spec.ts
    corpus.spec.ts
    scoring.spec.ts
    structural-compaction.spec.ts
    policy-boundaries.spec.ts
    replay.spec.ts
    multi-compaction.spec.ts
    report.spec.ts
    live-contract.spec.ts
  baselines/
    deterministic-rc6.json
```

Also modify:

- `package.json`
- `.gitignore`
- `.github/workflows/context-benchmark.yml`
- `docs/testing/long-context-benchmark.md`
- `CHANGELOG.md` only when implementation and all tests are complete

## 4. Implementation tasks

### Task 1: Establish a clean benchmark boundary

**Files:**
- Create: `docs/testing/long-context-benchmark.md`
- Inspect only: `apps/dsh-desktop/src/profile.mjs`
- Inspect only: installed `@deepseek-ai/dsh-compaction*`, `dsh-token-meter`, `dsh-session`, and `dsh-llm` type declarations

**Steps:**

1. Record `git status --short` and current package versions.
2. Document the official defaults currently under test: threshold `0.8`, retained tail `0.16`, summary output cap `8192`, automatic mode enabled, one compaction retry, and one overflow retry.
3. Document that the official DeepSeek adapter currently reports a 1,000,000-token default, while every benchmark run must trust the selected adapter's resolved capacity rather than infer one.
4. Document the invariant that one successful transaction is `compaction/start`, `compaction/summary`, one replacing `user/message`, then `compaction/end`.
5. Run `git diff --check` and commit documentation alone only if the working tree can be isolated safely.

Expected result: the benchmark contract is explicit before any runner is implemented.

### Task 2: Scaffold the private benchmark package

**Files:**
- Create: `packages/dsh-context-bench/package.json`
- Create: `packages/dsh-context-bench/tsconfig.json`
- Create: `packages/dsh-context-bench/vitest.config.ts`
- Create: `packages/dsh-context-bench/README.md`
- Modify: `package.json`

**Steps:**

1. Add a private ESM package named `@harness-design/dsh-context-bench`.
2. Add only the official DSH packages listed in the architecture and the existing workspace versions of TypeScript, Vitest, and Zod.
3. Add package scripts: `build`, `typecheck`, `test`, `bench:deterministic`, and `bench:live`.
4. Add root scripts:
   - `bench:context`: deterministic benchmark.
   - `bench:context:live`: opt-in live benchmark.
   - `bench:context:full`: manual full-capacity benchmark requiring explicit confirmation.
5. Write one failing smoke test that imports the future schema and runner.
6. Run the package test and verify it fails because the modules do not exist.
7. Add minimal exports and run the test again.

Expected result: package builds independently and is not included in the desktop runtime profile or aggregate Web UI bundle.

### Task 3: Define versioned fixture and report schemas

**Files:**
- Create: `packages/dsh-context-bench/src/schema.ts`
- Create: `packages/dsh-context-bench/tests/schema.spec.ts`
- Create: all seven JSON fixtures listed above

**Steps:**

1. Write a failing schema test for `schemaVersion`, fixture identity, context scale, transcript segments, required facts, superseded values, tool pairs, and expected next step.
2. Require fact IDs to be unique and weights to be positive integers.
3. Reject literal credentials, common API-key shapes, absolute home paths, and fixture payloads above the configured maximum.
4. Define a report schema containing package versions, adapter identity, context capacity, seed, run tier, fixture hash, before/after pressure, compaction events, per-metric scores, token usage, duration, and errors.
5. Parse every fixture in a test and snapshot only safe metadata, never the entire generated transcript.

Expected result: malformed fixtures and reports fail before execution.

### Task 4: Build deterministic long-context corpus generation

**Files:**
- Create: `packages/dsh-context-bench/src/corpus.ts`
- Create: `packages/dsh-context-bench/tests/corpus.spec.ts`

**Steps:**

1. Write failing tests for a seeded generator that places facts at exact early, middle, and late percentiles.
2. Generate repetitive but varied synthetic engineering messages; do not allocate one million real API tokens in CI.
3. Support `8K`, `32K`, `128K`, and `1M-policy` scales. The `1M-policy` case validates budget math and surface selection without a live million-token model call.
4. Make output byte-for-byte stable for the same fixture and seed.
5. Assert that generated mutable facts include both stale and latest values and that the oracle can distinguish them.

Expected result: corpus placement is deterministic across macOS, Windows, and Linux.

### Task 5: Compose the official deterministic harness

**Files:**
- Create: `packages/dsh-context-bench/src/runner/fake-adapter.ts`
- Create: `packages/dsh-context-bench/src/runner/official-harness.ts`
- Create: `packages/dsh-context-bench/src/runner/deterministic.ts`
- Create: `packages/dsh-context-bench/tests/structural-compaction.spec.ts`

**Steps:**

1. Write a failing integration test that composes Cordis, `LlmRuntime`, a fake `LlmAdapter`, `SessionStore`, `TokenMeter`, `ToolResultPruner`, and `BasicCompactionEngine`.
2. The fake adapter must report an explicit context window and emit valid DSH stream chunks plus exact token usage.
3. Feed a synthetic session through official `Session` events. Do not directly mutate surface internals.
4. Trigger compaction through `ctx.compaction`; use `compactIfNeeded` for pressure policy and `compactRegion` only for targeted range tests.
5. Assert transaction order, balanced boundaries, replacement source identity, shadowed seqs, retained tail, and measured pressure.
6. Assert the fake adapter receives `purpose: 'compaction'`, the original prefix, and the final official compaction instruction.
7. Assert cancellation stops summarization and records a failed bracket without committing a replacement.

Expected result: tests exercise the published official implementation rather than a copied approximation.

### Task 6: Cover policy boundaries, pruning, retries, and replay

**Files:**
- Create: `packages/dsh-context-bench/tests/policy-boundaries.spec.ts`
- Create: `packages/dsh-context-bench/tests/replay.spec.ts`

**Steps:**

1. Verify no automatic compaction immediately below 80% and compaction at or above the threshold.
2. Verify 16% recent-tail selection at multiple adapter capacities.
3. Verify exact per-model overrides beat defaults.
4. Verify long text tool results keep configured head and tail and cannot orphan a tool pair.
5. Verify one overflow recovery retry and one convergence retry are bounded.
6. Serialize and replay the session log; compare surface, compaction transaction, and report hashes.
7. Verify an interrupted `compaction/start` remains detectable and cannot masquerade as success.

Expected result: every structural release gate has a focused failing-then-passing test.

### Task 7: Implement deterministic scoring

**Files:**
- Create: `packages/dsh-context-bench/src/oracle.ts`
- Create: `packages/dsh-context-bench/src/scoring.ts`
- Create: `packages/dsh-context-bench/tests/scoring.spec.ts`

**Steps:**

1. Normalize Unicode, line endings, whitespace, and Markdown formatting without normalizing identifiers, numbers, paths, or commands.
2. Score exact and semantic-alias facts separately.
3. Treat any critical stale value presented as current as a hard failure.
4. Score checkpoint section completeness against the official eight-section structure.
5. Score post-compaction tail separately so a good summary cannot hide accidental loss of recent verbatim messages.
6. Add adversarial tests where a summary contains both old and new values, fabricated facts, or vague placeholders.

Expected result: a clearly wrong summary cannot pass because it shares keywords with the fixture.

### Task 8: Implement multi-compaction memory tests

**Files:**
- Create: `packages/dsh-context-bench/tests/multi-compaction.spec.ts`

**Steps:**

1. Run three compaction cycles.
2. Add new facts and corrections after each checkpoint.
3. Confirm prior checkpoint text is consolidated rather than copied verbatim.
4. Confirm still-active early facts remain retrievable after cycle three.
5. Confirm facts superseded in cycle two or three are no longer treated as active.
6. Record per-cycle scores and fail when a cycle drops by more than five points.

Expected result: the benchmark detects cumulative summary drift, not just one successful compression.

### Task 9: Add the opt-in live semantic runner

**Files:**
- Create: `packages/dsh-context-bench/src/runner/live.ts`
- Create: `packages/dsh-context-bench/tests/live-contract.spec.ts`
- Modify: `packages/dsh-context-bench/README.md`

**Steps:**

1. Require explicit `--live`, provider, model, maximum input-token budget, maximum output-token budget, and confirmation flags.
2. Resolve context capacity from the actual DSH adapter. Refuse unknown or invalid capacity.
3. Use the official adapter and credentials seam; never accept or persist a literal API key in fixture or report JSON.
4. Default to 32K smoke scale. Require a second explicit `--allow-full-capacity` flag above 128K.
5. Run deterministic probes against the produced checkpoint first.
6. Optionally ask the post-compaction model a fixed set of continuation questions and parse strict JSON answers.
7. If a judge is enabled, identify judge provider/model in the report and keep judge score informational until calibrated.
8. Run each scenario three times with recorded seeds; report mean, minimum, standard deviation, and hard critical failures.

Expected result: live execution is reproducible, budget-bounded, secret-safe, and cannot run accidentally from ordinary tests.

### Task 10: Produce human and machine reports

**Files:**
- Create: `packages/dsh-context-bench/src/report.ts`
- Create: `packages/dsh-context-bench/tests/report.spec.ts`
- Modify: `.gitignore`

**Steps:**

1. Emit `artifacts/context-bench/report.json` conforming to the versioned schema.
2. Emit `artifacts/context-bench/report.md` with a concise summary, failed facts, per-cycle trend, pressure change, token cost, and reproducible command.
3. Redact environment values, authorization headers, absolute user-home paths, and credential references before writing.
4. Add report artifacts to `.gitignore`; commit only reviewed baseline files.
5. Make process exit code nonzero when any release gate fails.

Expected result: CI and humans consume the same underlying facts.

### Task 11: Establish baselines and regression rules

**Files:**
- Create: `packages/dsh-context-bench/baselines/deterministic-rc6.json`
- Modify: `packages/dsh-context-bench/src/report.ts`
- Modify: `packages/dsh-context-bench/README.md`

**Steps:**

1. Generate a deterministic baseline pinned to exact official package versions and fixture hashes.
2. Fail when structural metrics differ from baseline.
3. For live metrics, do not overwrite a baseline automatically. Require `--accept-baseline` plus a clean working tree.
4. Mark results incomparable when adapter identity, context window, fixture hash, compaction configuration, or official package version changes.

Expected result: an upstream upgrade causes an explicit re-baseline review rather than a misleading pass.

### Task 12: Add CI without paid-token surprises

**Files:**
- Create: `.github/workflows/context-benchmark.yml`

**Steps:**

1. Run deterministic tests on Ubuntu, Windows, and macOS for pull requests touching compaction, session, token-meter, live-stats, orchestrator, or benchmark files.
2. Set a 90-second benchmark timeout and upload only sanitized deterministic reports.
3. Add a manual `workflow_dispatch` live job requiring provider, model, scale, and an environment protected by repository approval.
4. Do not add a cron live run in the first release.
5. Make the live job skip with a clear reason if the selected secret is absent.

Expected result: every platform protects structural behavior; paid semantic runs remain deliberate.

### Task 13: Final verification and documentation

**Files:**
- Modify: `docs/testing/long-context-benchmark.md`
- Modify: `CHANGELOG.md`

**Steps:**

1. Run `pnpm --filter @harness-design/dsh-context-bench typecheck`.
2. Run `pnpm --filter @harness-design/dsh-context-bench test`.
3. Run `pnpm bench:context` and verify deterministic gates pass.
4. Run `pnpm typecheck` and `pnpm test` for the full workspace.
5. Run `pnpm aggregate:check` and `pnpm test:scripts`.
6. Run `git diff --check`.
7. Inspect the generated JSON and Markdown for secrets and local absolute paths.
8. Document exact commands, expected cost behavior, known limits, and how to interpret every metric.
9. Add the completed feature to `CHANGELOG.md` only after all commands pass.

Expected result: the benchmark adds no runtime package to the desktop build and introduces no regression.

## 5. Suggested commit sequence

Keep commits small and do not mix existing connector changes:

1. `test: define long-context benchmark fixtures`
2. `test: compose official compaction benchmark harness`
3. `feat: score compaction memory quality`
4. `test: cover repeated compaction and replay`
5. `feat: add opt-in live context benchmark`
6. `ci: add deterministic context benchmark gate`
7. `docs: document long-context quality benchmark`

## 6. Final acceptance checklist

- [ ] Uses official DSH compaction, session, LLM, and token-meter seams.
- [ ] Does not modify or copy official compaction implementation.
- [ ] Deterministic tests pass on macOS, Windows, and Linux.
- [ ] Critical facts survive one and three compaction cycles.
- [ ] Superseded critical facts never appear as active state.
- [ ] Tool calls and results remain balanced.
- [ ] Retained recent tail is byte-for-byte unchanged.
- [ ] Session replay reproduces the same visible surface and report.
- [ ] Live runs require explicit opt-in and token budgets.
- [ ] Unknown model capacity fails closed instead of guessing.
- [ ] Reports contain no secrets or local user paths.
- [ ] Full workspace typecheck, tests, aggregate checks, and diff checks pass.
- [ ] README states that passing this benchmark is evidence for measured scenarios, not proof that compression is universally lossless or globally state of the art.
