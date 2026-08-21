# Adaptive Theme and Native Harness MVP Implementation Plan

1. Replace skin-center internals with adaptive image theme UI, host persistence routes, palette extraction, scoped runtime CSS, and tests.
2. Remove preset skin aggregation and desktop managed-runtime entries; add migration cleanup for stale managed packages and old patch rows.
3. Add a native Harness core package containing run/feature schemas, state transitions, atomic project storage, sanitized trajectory projection, bounded memory retrieval, and default role files.
4. Wire both packages into the desktop aggregate and profile without modifying official DSH packages.
5. Add unit tests for contrast, upload validation, profile migration, state transitions, redaction, and retrieval bounds.
6. Build all changed packages, run desktop tests/package verification, bump the desktop version, and create a macOS ARM64 DMG.
