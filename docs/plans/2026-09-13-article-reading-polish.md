# Article reading repair and visual refinement

User request: investigate unavailable WeChat images, improve summary structure, repair the summary editor and align knowledge-card tags/actions. Preserve the dirty working tree, original articles and user edits. No commit, real-account operation or publication. Use synthetic fixtures for regressions; the public article URL is requested separately to establish its specific image failure.

## Design

Use a restrained editorial reading layout within JIWEI's existing theme tokens: aligned title/byline/body column, compact secondary provenance, well-spaced summary headings and lists, full-width editing with clear controls, and a unified card footer. Preserve the existing theme and prioritize reading hierarchy and usable editing space.

## Work and evidence

1. Reproduce narrow summary editor in actual Electron and missing structural parsing in unit tests. Add geometry checks for the card footer and scroll reset between reading tabs.
2. Request structured summary data (overview, grouped points, tags), render it as bounded Markdown on the host, retain compatibility with existing text responses. Render safe headings/lists/emphasis; never execute HTML or fetch Markdown images. Existing stored summaries remain intact.
3. Repair scoped reader/editor/card styles and controls, including narrow and zoomed viewports. Keep all existing draft/close/save/cancel behavior.
4. Investigate image fetching independently of the summary model. Preserve public-address validation, redirect validation and byte limits. Add safe diagnostic categories where failures are currently collapsed; do not invent the cause for this specific article or weaken network restrictions.
5. Run affected tests, typechecks/builds and Electron reading regression; inspect synthetic screenshots. Record outcomes and remaining real-article uncertainty. The previous DMG is a snapshot and does not automatically include these changes.

Status: source implementation and local synthetic verification complete on 2026-09-13. All five work items above are complete within the stated scope; the exact user article remains unverified without its public URL. No new DMG was produced.

Evidence: [dated QA report](../qa/2026-09-13-article-reading-polish.md). Knowledge 88/88, Extension Center 95/95, Desktop 256/256, both package typechecks/builds passed. Actual Electron reading 7/7 includes summary structure, editor geometry, scroll reset, card alignment, narrow wrapping, zoom, save/close and offline images; general acceptance 5/5. A local TLS/proxy fixture verifies actual Chromium credentials and redirect behavior in two additional checks.

The actual network fixture rejected the initial Electron `session.fetch` implementation on manual redirects. The final implementation uses `net.request` with synchronous allowlisted redirect checks. This correction is based on real Electron behavior, beyond mocked transport tests. The first stalled fixture entry was also corrected to avoid awaiting app readiness during module evaluation; its generated temporary certificate was removed.
