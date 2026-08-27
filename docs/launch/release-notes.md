# Harness Design Desktop 0.1.39

This release adds an opt-in long-context quality layer above the official DeepSeek Harness runtime. It observes the current session model and official execution route without replacing the Agent Loop, model adapter, or compaction engine.

## Highlights

- Run explicit 32K or 128K probes from **Agent Harness → Context Quality**. A run always requires confirmation and sends three seeded samples; simply opening or refreshing the dashboard spends no API tokens.
- Verify the active adapter's published context capacity before execution. Missing route metadata or insufficient capacity fails closed instead of silently changing the model or scale.
- Measure critical facts, exact literals, current-state retention, stale-state leakage, constraints, pending work, tool-result pairing, and section completeness.
- Compare the latest score, pass rate, context window, metric breakdown, and bounded history for each scale.
- Persist only sanitized summaries using atomic writes. Raw prompts, raw model output, secrets, home paths, and workspace content are not written to history.
- Keep the deterministic `dsh-context-bench` suite as the reproducible CI quality gate; live probes are an explicit real-model acceptance layer, not a claim that every provider or model has already passed.

## Verification

The release is covered by:

- context-quality storage, sanitization, malformed-file, and bounded-history tests;
- current-route, adapter-capacity, confirmation, three-seed, and no-raw-content probe tests;
- dashboard rendering and manual-run interaction tests;
- the full workspace test and typecheck suites;
- all deterministic long-context benchmark fixtures;
- aggregate, script, production-build, and whitespace gates.

## Installation and release boundary

Use the installer matching the host architecture from the project Releases page and verify its SHA-256 checksum. The public community build is unsigned, so Windows SmartScreen or macOS Gatekeeper may show an unknown publisher. This project is not an official DeepSeek distribution.

No `desktop-v0.1.39` tag should be published until the exact release commit passes the Windows x64, macOS Intel, and macOS Apple Silicon CI matrix.
