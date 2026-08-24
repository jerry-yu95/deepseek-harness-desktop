# Long-Context Memory and Compaction Benchmark

This document defines the compatibility boundary for the long-context quality benchmark. The benchmark measures the published DeepSeek Harness behavior; it does not replace, fork, or copy the official compaction implementation.

## Official package boundary

The initial baseline targets these installed packages:

| Package | Version |
|---|---|
| `@deepseek-ai/cordis` | `4.0.1` |
| `@deepseek-ai/dsh-session` | `0.1.0-rc.6` |
| `@deepseek-ai/dsh-llm` | `0.1.0-rc.6` |
| `@deepseek-ai/dsh-token-meter` | `0.1.0-rc.6` |
| `@deepseek-ai/dsh-compaction` | `0.1.0-rc.6` |
| `@deepseek-ai/dsh-compaction-basic` | `0.1.0-rc.6` |
| `@deepseek-ai/dsh-compaction-tool-result-pruner` | `0.1.0-rc.6` |
| `@deepseek-ai/dsh-llm-deepseek` | `0.1.0-rc.6` |

An upstream package change makes a stored result incomparable until the baseline is reviewed and accepted again.

## Compaction policy under test

The official `dsh-compaction-basic` defaults are:

| Setting | Default |
|---|---:|
| Request-pressure threshold | `0.8` of the adapter context window |
| Verbatim recent-tail retention | `0.16` of the adapter context window |
| Summary output cap | `8192` tokens |
| Automatic compaction | enabled |
| Convergence retries | `1` |
| Context-overflow recovery retries | `1` |

Exact provider/model policy overrides take precedence over these defaults. Tests must obtain the selected model's context capacity from the resolved adapter. They must fail closed when capacity is absent, invalid, or non-positive.

The official DeepSeek adapter currently exports a default context window of `1,000,000` tokens. That value is adapter-specific and is not a universal Harness limit. Reports must record the actual resolved provider, model, and context window used by each run.

## Successful transaction invariant

One successful compaction transaction must contain, in order:

1. `compaction/start`
2. exactly one `compaction/summary`
3. exactly one replacing `user/message`
4. `compaction/end` without an error

The replacement must reference the opening and summary events plus every shadowed source sequence. Its surface operation must replace the exact selected range. A failed or cancelled transaction may close with an error, but it must not commit a replacement body that can masquerade as a successful checkpoint.

## Execution tiers

- `deterministic`: credential-free structural and oracle tests suitable for ordinary CI.
- `live`: explicit real-model semantic smoke tests with input and output budgets.
- `full-capacity`: manual-only tests requiring a second confirmation above 128K input tokens.

Passing the benchmark is evidence for the versioned fixtures and measured routes. It is not proof that all possible conversations compress losslessly or that the implementation is universally state of the art.

## Safety rules

- Fixtures are synthetic and must not contain copied user conversations, credentials, or absolute home-directory paths.
- Reports redact authorization headers, environment values, credential-shaped strings, and local user paths.
- Live execution requires explicit opt-in and cannot run in the ordinary workspace test command.
- Benchmark artifacts are not part of the desktop runtime profile or Web UI aggregate bundle.
- Existing unrelated working-tree changes must not be reset, stashed, discarded, or included in benchmark commits.

## Commands and baseline behavior

Run the credential-free gate with:

```bash
pnpm --filter @harness-design/dsh-context-bench typecheck
pnpm --filter @harness-design/dsh-context-bench test
pnpm bench:context
```

Reports are written to the ignored `artifacts/context-bench/` directory. The deterministic runner compares fixture hashes, official package versions, adapter identity, resolved context windows, and release-gate metrics with `baselines/deterministic-rc6.json`. Any mismatch is deliberately treated as incomparable until a maintainer reviews and accepts a new baseline.

The live runner is an adapter-neutral contract around the official DSH model/credential seam. It requires `--live`, explicit provider/model and token budgets, `--confirm RUN_LIVE_CONTEXT_BENCHMARK`, and a bridge module exporting `resolveContextWindow` and `runProbe`. It defaults to 32K and needs `--allow-full-capacity` above 128K. It never accepts a literal API key as a benchmark option and reports only sanitized scores and token counts. The CLI does not invent a provider capacity or silently make a paid call.

The first CI workflow runs deterministic tests on Ubuntu, Windows, and macOS with a two-minute job timeout. Live execution is manual-only and protected by the `context-benchmark-live` environment; without a configured bridge it prints a skip reason and makes no model call.
