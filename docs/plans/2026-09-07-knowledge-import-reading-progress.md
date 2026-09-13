# My Brain Article Import and Reading Progress

## Execution context

- Plan: `docs/plans/2026-09-07-knowledge-import-reading-plan.md`
- Requirements: `docs/plans/2026-09-07-knowledge-import-reading-requirements.md`
- Execution started: 2026-09-07
- Working tree: existing connector repair changes and plan documents are preserved; no reset or cleanup performed.
- Safety: only synthetic fixtures and isolated profiles may be used. No real credentials, cookies, tokens, private endpoints, or account data belong in this file.

## Task status

| Task | Status | Evidence |
| --- | --- | --- |
| 0 Baseline | complete | Knowledge 29/29, extension 52/52, desktop 237/237; existing dirty connector work preserved. |
| 1 Article/source model | complete | Separate summary, bounded detail, legacy fallback, edit provenance and monotonic edit revisions; store 11/11, validation 8/8. |
| 2 Structured extraction | complete | Shared pure DOM projection; host URL tests and compiled browser extraction are covered by the final package and desktop suites. |
| 3 Detail and summary RPC | complete | detail/summarize/edit-summary and client projections; independent summary with consent, cancellation, timeout, safe errors, revision checks and suggested tags. |
| 4 Configured model route | complete | Official llm directory plus agentDefaultModel.currentSelection; no-session plugin wiring tested using a synthetic adapter. |
| 5 Cancellable import state | complete | Attempt-scoped reducer, sender-bound IPC, start/cancel/progress lifecycle, idempotent candidate creation and persistence cancellation guards. |
| 6 Import dialog and reader | complete | Fetch/structure/summarize/preview stages, bounded reader, separate summary flow, cancel/close recovery and configured-model route. |
| 7 Compact list and detail editing | complete | Bounded cards, source metadata, summary/detail tabs and editable candidate/confirmed content. |
| 8 Tag picker | complete | Keyboard-accessible existing/new tag picker, NFC/exact-case validation and suggested-tag review. |
| 9 Atomic tag movement | complete | Atomic menu/drag movement, virtual Other fallback, refresh persistence and conflict-safe store updates. |
| 10 Failure and security review | complete | Failure-path, cancellation, SSRF/DOM, sender-binding, credential-redaction and prompt-injection regression coverage. |
| 11 Isolated Electron acceptance | complete | Synthetic 20k article + Fixture model: 4/4 scenarios passed; legacy isolated acceptance also 5/5. |
| 12 Full regression/build handoff | complete | Knowledge 65/65, extension 68/68, desktop 245/245; typechecks/builds/diff check passed. No package or real-account acceptance. |

## Baseline evidence

- HEAD `f4fd631`, branch `codex/jiwei-0.1.45-readiness`; no commits, reset, stash, packaging or publishing performed.
- Baseline package commands: knowledge test 29/29, extension-center test 52/52, desktop test 237/237, all exit 0 after using approved test permissions. Original wall-time evidence was not retained; no duration is reconstructed.
- Initial sandbox failures were localhost DNS/loopback restrictions, not assertion failures. Permission-approved reruns passed.
- Preexisting connector changes remain in desktop package/IPC/preload/connectors/auth/log-store/tests/acceptance script, extension bridge/locales/CSS/connector UI/generated bundle and lockfile. This batch does not claim ownership of those earlier changes.

## Implementation evidence

### Audit and continuation, 2026-09-08

- The previous progress table was stale. Task 2's original implementation patch had failed; new extraction tests were therefore still RED. Implemented the missing projection rather than claiming it was already complete.
- Corrected `originalByteLength` validation: it describes pre-truncation length and may exceed 1 MiB. Stored text remains capped at 1 MiB UTF-8.
- Retained the existing HTTP download size guard. The incorrect test expecting oversized downloaded HTML to succeed now tests rejection; browser-projected long text separately tests explicit truncation.
- Task 1 initial RED: four metadata/detail tests failed before implementation. Continuation RED: identical-time summary revision and unbounded oversized snapshot read both failed. GREEN: dedicated summary editing preserves provenance and note/source; snapshot reads are bounded, missing snapshots fall back, snapshot write failure creates no visible record.
- Task 2 RED: missing article metadata/structure. GREEN: heading/paragraph/list/quote projection, synthetic nested WeChat fixture, unknown author, compiled standalone browser script stripping executable elements, UTF-8 length limits.
- Added a direct desktop workspace dependency and a pure `article-text` package export. This avoids loading the host plugin just to extract text. Offline install used the existing pnpm store, downloaded zero packages and ran no installation scripts. The initial sandbox install request for module removal was not accepted; existing modules were preserved.
- Latest `pnpm --filter @harness-design/dsh-knowledge test`: **39/39**, exit 0, reported duration 1.21s.
- `pnpm --filter @harness-design/dsh-knowledge typecheck` and `build`: exit 0. Generated knowledge library updated, including pure extraction entry.
- Latest `pnpm --filter @harness-design/desktop test`: **239/239**, exit 0, reported duration 4.06s; includes six browser-import tests and existing connector regressions.
- No production UI or live-model behavior is claimed complete. Task 3 onward remains pending. Import metadata still needs RPC/client plumbing; real progress/cancel work belongs to Task 5. Long-reader Electron acceptance has not run for this feature.

### Task 3-4 batch, 2026-09-08

- Reviewed current dirty state before resuming; existing connector fixes remain untouched. Followed executing-plans and Code workflow, with security-auditor for model invocation and public error boundaries.
- Task 3 RED: six new detail/summary tests failed because endpoints and independent summarizer were absent. Client projection RED: `detail` was absent. GREEN: detail is ID-only and list excludes snapshot body; summary text/provenance are separate; edit-summary preserves provenance and sets editedByUser; cancellation and revision conflicts prevent late overwrites.
- Model request has no tools. Title, tags and bounded source are serialized as untrusted data. Source bound is 128 KiB; sourceTruncated is host-owned. Summary validates JSON keys, length, tags, HTML and synthetic sensitive patterns. Suggested tags exclude user-selected labels and fit remaining slots; they do not silently overwrite saved tags. UI acceptance of suggestions remains Task 6/8.
- Added a 60-second bounded model operation, forwarding AbortSignal to the SDK, with pre-call and pre-persistence checks. Temporary record files are removed on aborted writes. Timeout, cancellation and provider errors return fixed safe codes without raw response details.
- Task 4 discovery: inspected installed official SDK declarations and implementations. `LlmRuntime.listProviders()` lists registered adapters; `listModels(provider)` lists their advertised models. The official Host API gateway uses `ctx.agentDefaultModel.currentSelection()` for its default, backed by `@deepseek-ai/dsh-agent-default-model`. Only this read API is consumed, not settings documents or credentials.
- Added the existing official SDK package as a peer/dev dependency via offline cache (zero downloaded packages, scripts disabled). No SDK source edits.
- ModelRouteResolver returns stable hashed route IDs and bounded provider/model labels only; it checks current registration/catalog again before invocation. Live session selection takes precedence for directory preselection, otherwise official default selection. Missing/removed routes fail explicitly rather than switching provider. Currently only registered advertised text-model routes are selectable; an absent default does not select an arbitrary alternative.
- Task 4 RED: missing resolver module. GREEN: no-session default, live-session selection, removed provider/model, no configuration, unsafe display metadata, cancelled/stalled lookup. Plugin-level test uses temporary DSH_HOME and a fake adapter to exercise the actual apply wiring: no session lookup and zero stream calls without consent.
- Final batch checks (all exit 0): knowledge **54/54** (1.25s), extension-center **52/52** (1.61s), desktop **239/239** (3.96s); both knowledge and extension-center typechecks/builds passed. Generated libraries updated, including the shared store chunk emitted by tsdown.
- Next: Task 5 real import progress/cancellation and sender-bound IPC, then Tasks 6-9 reader/compact list/tag UI. No new reader UI or Electron acceptance is claimed by these backend tests. Task 12 remains incomplete; no DMG, real model/account, push or release operation performed.

### Task 5 partial implementation, 2026-09-08 (historical checkpoint)

- RED reproduced: invalid URL permanently locked the browser importer; cancellation waited for the 25-second load timeout. Fixed validation-before-lock and AbortSignal-aware bounded load/extraction/verification waits. Cancellation destroys the isolated window and releases the importer; listeners and wait timers are cleaned up. Progress callbacks reflect fetching, structuring and user verification boundaries.
- Added an attempt-scoped pure import reducer. Duplicate submissions and stale/cancelled results are ignored; a summary retry retains the candidate and original article instead of fetching again. RED was missing module; GREEN covers both state scenarios.
- Verification: browser-import 8/8; complete desktop 241/241; complete extension-center 54/54; extension-center TypeScript check passed. Initial sandbox Vitest startup could not resolve localhost; permission-approved synthetic rerun passed. No live model or account was used.
- At this checkpoint Task 5 was not complete: sender-bound IPC/start/cancel/progress subscription, generic HTTP cancellation, idempotent candidate creation and persistence cancellation guards still required implementation and tests. The reducer was not yet connected to the import dialog. The continuation below records the completion of those items.

### Task 5-9 implementation continuation, 2026-09-08

- Task 5 was completed after the earlier partial checkpoint. Added sender/frame-bound knowledge import IPC with attempt-scoped start/cancel/progress subscriptions, cancellation-safe browser and HTTP work, duplicate-attempt protection, idempotent candidate creation and persistence guards. Late progress/results are ignored after cancellation or replacement.
- Task 6 added the end-to-end capture flow: fetching, structuring, summarizing and preview states are visible; article detail is loaded separately from the bounded list; summary generation is independently cancellable and uses the configured client model route. Saved previews remain reviewable and close through an explicit keep/discard boundary.
- Task 7 added bounded article cards, source/title/author metadata, reader tabs, long-content scrolling, summary editing and candidate/confirmed editing. The original source remains separate from user-edited summary/content provenance.
- Task 8 added the keyboard-friendly tag picker with existing-tag suggestions and controlled new-tag creation. Tags are normalized using NFC and exact case, with suggested tags requiring explicit confirmation.
- Task 9 added atomic menu and drag movement, including the virtual `Other` destination when no user tag exists. Store updates preserve the article identity and survive refresh; stale revisions and conflicting moves fail closed.
- Component and reducer coverage now includes knowledge import flow 6/6, import state 2/2 and tag picker 7/7 in the final extension suite. No real public-account article, TAPD/iWiki account or production model was used.

### Task 10-12 final verification, 2026-09-08

- Task 10 security review completed with synthetic regression coverage for no-consent model invocation, cancellation before persistence, timeout/provider-safe errors, URL redirect/private-address rejection, executable DOM stripping, sender/frame binding, credential-shaped output redaction and prompt-injection-like article instructions treated as untrusted content. No credential, cookie, token or private endpoint was added to source, logs or screenshots.
- Task 11 isolated Electron acceptance passed **4/4** scenarios: staged import progress and structured preview; model summary preview; tag creation and menu movement; native drag to `Other` plus refresh persistence; and narrow/zoomed reader layout checks. The test uses a synthetic long article and a test-only Fixture model. Screenshots were inspected and contain only synthetic data.
- The pre-existing isolated acceptance was rerun after adapting it to the reviewable capture dialog and passed **5/5** scenarios, including connector preview/status and connector editor persistence against a synthetic loopback fixture.
- Task 12 final checks passed: knowledge package **65/65** tests, extension-center **68/68** tests, desktop **245/245** tests; knowledge and extension-center typechecks; both package builds; JavaScript syntax checks for the new acceptance/import scripts; and `git diff --check`. The first ordinary-sandbox test attempt was blocked only by local test-server permissions; permission-approved reruns passed.
- This execution stops at Task 12 as requested. No DMG was built, no real account acceptance was run, and no commit/push/release operation was performed.

## Known boundaries

- Real TAPD/iWiki and real public-account/model acceptance are user-operated later.
- Task 13 packaging is explicitly out of scope for this execution.
