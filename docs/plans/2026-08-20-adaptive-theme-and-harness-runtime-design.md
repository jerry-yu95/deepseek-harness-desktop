# Adaptive Theme and Native Harness MVP Design

## Product outcome

Replace the nine fragile preset skins with one local custom-image theme. The user uploads PNG, JPEG, or WebP; the client samples the image, chooses light or dark mode, derives an accent, and generates safe surface/text tokens. The official DSH layout remains intact.

In the same release, introduce the first native Harness orchestration foundation inspired by persistent cognitive roles and planner-generator-evaluator workflows.

## Adaptive theme

### Data flow

1. File input validates type, size, and dimensions.
2. Canvas downsamples the image and derives average luminance plus a saturated accent.
3. A deterministic contrast guard chooses foreground/surface colors and verifies WCAG contrast.
4. Preview uses an object URL and one scoped style element.
5. Apply uploads the original image and palette to a same-origin local host route.
6. On next boot the plugin loads the saved manifest and applies the same tokens.

The image never leaves the machine. The host accepts a bounded binary body, writes atomically, and serves only its fixed theme asset path. Restore removes the manifest and returns to the official theme immediately.

### Migration

Desktop profile reconciliation removes packages previously managed by the desktop but no longer in the managed set. It also strips the old `dsh-skin managed` patch section. Existing community packages that the desktop never managed are not touched.

## Native Harness MVP

The first release provides a project-local state contract and three default role definitions:

- Planner: turns an objective into verifiable features.
- Grounding reviewer: checks repository facts and plan drift.
- Completion evaluator: judges evidence against acceptance criteria.

The runtime package supplies schemas, atomic storage, trajectory sanitization, bounded memory retrieval, and deterministic transition rules. Model-driven background reviewers are integrated through official DSH subagents after the storage/state contract is proven; the initial package does not replace official workflow, goal, or compaction services.

## Failure handling

- Invalid images are rejected before persistence.
- A failed preview leaves the current theme untouched.
- A corrupt theme manifest restores the official theme.
- A corrupt Harness run is preserved as a timestamped recovery copy and recreated only on an explicit initialization path.
- Orchestration failures never block ordinary chat.
