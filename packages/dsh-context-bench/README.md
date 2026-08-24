# DSH Context Benchmark

Private workspace tooling for measuring long-context memory and compaction quality through official DeepSeek Harness extension seams.

## Safety

- Ordinary tests are deterministic and require no credentials.
- Live model execution is opt-in and budget limited.
- Generated reports must be sanitized before they leave the machine.
- This package is not included in the desktop runtime profile or Web UI aggregate bundle.

Passing this benchmark is evidence for the versioned scenarios and selected model route. It is not proof that every conversation compresses losslessly.

## Local deterministic run

```bash
pnpm --filter @harness-design/dsh-context-bench test
pnpm bench:context
```

The deterministic command validates the official DSH session, compaction, token-meter, and tool-result-pruner seams with a credential-free fake adapter. It writes reviewed JSON and Markdown reports under `artifacts/context-bench/` and compares the result with `baselines/deterministic-rc6.json`. A fixture hash, official package version, adapter identity, or context-window change intentionally requires a baseline review.

## Opt-in live run

Live execution is never part of ordinary tests and does not read a literal API key from fixtures or command output. The host must provide an adapter bridge module that uses the official DSH credential/model seam and exports `resolveContextWindow` and `runProbe`. The bridge returns only sanitized scores and token counts.

The invocation must include `--live`, provider, model, both token budgets, and `--confirm RUN_LIVE_CONTEXT_BENCHMARK`. The default scale is 32K and each run uses at least three unique seeds. Above 128K, add `--allow-full-capacity`; invalid or unknown adapter capacity fails closed. The runner reports mean, minimum, standard deviation, token totals, and hard failures.

```bash
node --experimental-strip-types src/cli.ts --tier live \
  --live --provider deepseek-official --model deepseek-v4-flash \
  --max-input-tokens 32768 --max-output-tokens 4096 \
  --confirm RUN_LIVE_CONTEXT_BENCHMARK --adapter-module /absolute/path/to/official-bridge.mjs
```

Do not put credentials in the bridge's exported result, fixtures, or reports.
