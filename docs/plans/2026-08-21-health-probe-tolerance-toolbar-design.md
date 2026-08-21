# Health probe tolerance and toolbar controls

## Goal

Prevent provider formatting drift from being shown or counted as model degradation, and align Agent Harness composer controls with the official borderless toolbar language.

## Design

The direct health probe remains a bounded, isolated call through the active official DSH provider/model route. Its output passes through a normalization boundary before scoring: extract the first balanced JSON object from optional prose or Markdown, normalize scalar and list representations, then score each expected dimension independently. A completely unreadable response receives one deterministic retry. If both attempts fail, the run records no health sample and presents a retryable user message instead of an internal error code.

The composer exposes two sibling controls. Orchestration uses a line-network icon, current mode label, and chevron; model health uses a line-pulse icon, current health label, and chevron. Both have transparent backgrounds and no visible border at rest, with color-only hover and a WCAG-visible keyboard focus ring. Their existing popovers remain responsible for descriptions, selection, diagnostics, and details.

## Verification

- Parse JSON embedded in prose and Markdown.
- Normalize numeric scalar and comma-separated list drift.
- Retry once after unreadable output.
- Never store a failed protocol response as degradation evidence.
- Verify both toolbar controls expose SVG line icons and accessible buttons.
- Run orchestrator tests/typecheck, workspace build, desktop tests, aggregate checks, and package audit.
