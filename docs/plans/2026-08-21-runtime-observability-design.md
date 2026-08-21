# Runtime Observability Design

## Goal

Add a local-first runtime health surface that combines model health, Agent Harness stage traces, cache benefits, and token consumption without issuing background model calls.

## Architecture

The existing official `liveTokenUsage` session projection remains the source of truth for provider usage. The orchestrator samples that cumulative projection while a session is active and writes only positive deltas to a versioned project-local ledger. Stable event IDs and per-session snapshots make repeated polling idempotent. Missing provider buckets remain explicitly unavailable rather than being guessed.

Agent role execution writes bounded stage events to the same ledger. Cache events include namespace, hit/miss, elapsed time, and optional token savings. Model-health events continue to be derived from normal runs; the existing isolated probe remains user initiated.

The dashboard returns one aggregate snapshot for a requested period. It contains totals, per-model usage, daily trend points, recent stage traces, cache benefit metrics, and model health. The browser renders four tabs: Overview, Model Health, Agent Trace, and Token Usage. Period presets are today, 7 days, 30 days, current month, and all time.

## Privacy and Reliability

Events contain identifiers, counters, timestamps, bounded summaries, and sanitized errors only. They never contain API keys, full prompts, full answers, or hidden reasoning. Writes use atomic replacement. Corrupt ledgers are quarantined logically by returning a diagnostic and starting from an empty view; conversation execution never fails because observability failed. Retention is bounded by event count.

## Verification

Tests cover snapshot de-duplication, positive deltas, model aggregation, period filtering, missing usage, stage traces, cache savings, RPC validation, and tab rendering. Release verification includes orchestrator tests, desktop tests, type checks, production build, and a visual smoke test.
