# Knowledge Regression Repair Progress

Date: 2026-09-12 (final local synthetic verification)
Branch: `codex/jiwei-0.1.45-readiness`
Baseline: `f4fd631`

## Task 0 — complete

- Preserved the existing mixed working tree. No reset, stash, commit, package, publish, or real-account operation was performed.
- The current tree contains the earlier connector and knowledge-import changes plus the new regression plan.
- Ordinary sandbox baseline: Vitest could not start because the environment rejected `localhost` resolution; desktop tests reached loopback startup and 16 tests failed from sandbox `127.0.0.1` listen restrictions.
- Permission-approved synthetic baseline:
  - `pnpm --filter @harness-design/dsh-knowledge test` — **65/65 passed**.
  - `pnpm --filter @linxin666/dsh-client-ui-extension-center test` — **69/69 passed**.
  - `pnpm --filter @harness-design/desktop test` — **245/245 passed**.
- No credentials, cookies, tokens, internal endpoints, or real article/account data were read or written.

## Execution notes

The plan requires a failing test before each behavioral change. The existing test suite is green for its current contract, but it does not cover the reported regressions. Tasks 1 onward therefore begin by adding synthetic regression cases and recording their RED result before implementation.

## Task status

The table is the 2026-09-12 verified checkpoint. Completion is limited to the plan's local implementation and synthetic acceptance scope; it does not certify a real provider, real account, packaged application, or release.

| Task | Status | Evidence |
| --- | --- | --- |
| 0 Baseline | complete | Rechecked f4fd631 and preserved dirty tree; fresh baseline knowledge 71, extension 82, desktop 246 passed. |
| 1 Failure-path tests | complete | RED/GREEN evidence below; import-flow, tags, tab and 11 new regression cases. |
| 2 Tag buffering | complete | Pending tags survive import/save/confirm; IME, commas, NFC, limits, reserved names and unsupported characters checked. Electron reopen proves persistence. |
| 3 Confirm transaction UX | complete | Save precedes confirm, duplicate/failed requests covered; closes dialog, selects confirmed, clears filters, one success notification; refresh failure does not undo success. |
| 4 Close/cancellation lifecycle | complete | API identity does not reload model/detail; dirty summary/notes and save-close failures retain drafts; cancelled late saves cannot confirm; actual Escape, focus trap and focus restoration passed. |
| 5 Summary root-cause reproduction | complete, synthetic scope | Installed official SDK finish/event contract inspected. Fenced JSON, reasoning, truncation, error/aborted and deadline paths reproduced. Actual user provider failure remains unverified. |
| 6 Summary compatibility/error UI | complete | Safe error categories, vanished route feedback, partial catalog failure, explicit model choice and summary tab selection; Electron failure/change-model/retry passed. |
| 7 Restricted image extraction | complete | Shared text/image projection, UTF-16 positions, lazy/relative/deduplicated sources, separate metadata/bytes, sparse resources and cancellation cleanup. |
| 8 Restricted image loading/rendering | complete | DNS-pinned requests, redirect revalidation, limits, raster signatures, canonical Base64, failure placeholders and cached reopen with public requests blocked. |
| 9 Reader layout/semantics | complete | Actual 40px title and empty/single-line tag frame; capture no longer collapses; four reader viewport/zoom cases, empty new notes, independent summary, retained drafts. |
| 10 Composer runtime layout | complete | SDK DOM measured: 46px RED -> 0px wide-layout delta. Desktop-scoped grid, model truncation, deliberate two rows below 560px; 15 states per language passed. |
| 11 Electron regression | complete | Knowledge 7/7; composer Chinese 15/15 and English 15/15; synthetic screenshots opened and inspected. |
| 12 Full verification handoff | complete | 424 package tests, both typechecks/builds, knowledge/composer E2Es, acceptance 5/5, diff check and build exports passed. Stop before packaging/account validation. |

## 2026-09-12 continuation (intermediate evidence, superseded by final checks below)

- User authorized completing the remaining repair tasks through Task 12; no packaging, account operation, commit, push or release.
- Recovered baseline: HEAD f4fd631, same branch and mixed working tree preserved. Fresh knowledge 71/71 and extension 82/82 tests plus both typechecks passed during the status audit. Desktop continuation baseline 246/246 passed. Vitest requires the approved outside-sandbox localhost environment.
- UI RED: eight added cases failed for pending-tag save, comma overflow loss, summary dirty-close, save-and-close failure, late cancelled saves, model catalog states, summary selection, and refresh-after-confirm feedback. GREEN: eight passed after implementation; old busy-close/catalog expectations updated to the new contract. Additional image-order RED showed P/P/FIGURE instead of P/FIGURE/P; fixed with optional text offsets.
- Image RED: missing shared restricted fetch module. Implemented pinned DNS and per-redirect validation, no session/cookies/Referer, MIME/signature validation, 5 MiB per image, 20 MiB total, 50 images, 8 seconds per fetch and 30 seconds per article image batch. Failure retains an unavailable placeholder and text. HTTP and desktop extraction share position calculation. Old images without offsets remain readable at the end of the article.
- Store RED: a failed first image made the subsequent successful resource fail stable-order validation. Fixed sparse resource validation while keeping full metadata order strict. Corrupt cache reads retain image positions; reads are size-bounded. Partial cancelled cache writes clean only the uncommitted proposal's resources.
- Intermediate GREEN: knowledge 79/79; extension 91/91; desktop browser-import 10/10; both packages built. These counts precede additional cancellation/empty-note tests and are not final acceptance.
- SDK evidence: installed @deepseek-ai/dsh-llm 0.1.1-rc.2 lib/types/types.d.ts defines stop/tool-calls/max-tokens/aborted/error; BlockAssembler separates reasoning and text and defaults missing finish to stop. New RED tests showed error/aborted incorrectly mapped to invalid-format. They now map to safe failure/cancellation. No provider name or token limit was guessed or changed.
- Store cancellation RED showed update committed despite an already-aborted signal. Signals now reach note/summary edits and transitions, checked within the per-item lock and before atomic writes. Cancellation cannot roll back an already committed write, and the close UI says so.
- Electron first run: capture geometry passed; import failed before summary. Screenshot inspected. Root cause: empty article notes and empty image alt were rejected by the old nonempty validator; added a store reproduction. Manual notes retain their nonempty rule; article notes and image alt may be empty. This is being revalidated.
- Composer first probe now got past onboarding. Empty composer alignment passed, but no runtime conclusion is drawn from that. The new probe uses an SDK fixture adapter, synthetic workspace, and measures submitted/streaming/stopped states. Installed DOM owner: @deepseek-ai/dsh-client-ui-conversation/lib/client.js, embedded InputBar.module.css and skeleton InputBar; local style ownership will be recorded after the runtime cause is measured.
- Real models, real public-account network behavior, TAPD/iWiki, final Electron visual acceptance and final full verification remain unverified at this checkpoint.

## Final repair evidence

- Composer RED: `node apps/dsh-desktop/scripts/verify-composer-layout.mjs` failed with vertical delta 46px in wide-empty. Runtime probe also measured submitted/streaming/stopped: row 698px, tools 417.25px plus trailing 352.90px and gaps forced wrapping. Official owner is `node_modules/.pnpm/@deepseek-ai+dsh-client-ui-conversation@0.1.1-rc.2_b441692b8d185dbf8cce39ef789ff602/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js`, embedded InputBar.module.css. No SDK files changed. Local owner is `apps/dsh-desktop/src/composer-layout.mjs`, injected by `window-chrome.mjs`; selectors are limited to `[data-composer-card]`. Wide group centers now match (0px); widths below 560px use two explicit rows. The suite includes empty, submitted, streaming, drafting during streaming and stopped at 1280/1024/800px in Chinese and English.
- Reader RED: actual tag outer frame was 52px vs title 40px. The generic `input:not([type='checkbox'])` selector overrode the intended 28px inner minimum. More specific local input rules fix empty and single-line tag frames to 40px without fixing the outer height for wrapping chips.
- Visual review caught a second layout defect that the old compact-size assertion missed: the capture body collapsed under a zero flex basis. Added an Electron assertion that URL/category/tags/model/consent are all within the form body, observed RED, then restored intrinsic flex basis for auto-height capture forms. Final screenshot shows all controls; the form remains bounded.
- Added route-unavailable and invalid-character tag RED/GREEN cases. Unsupported tags are rejected before import RPC. A removed route now offers a clear change-model/retry message while retaining original text.
- Image budget RED: a synthetic 5MiB raster-signature payload was rejected. Direct decoder reproduction returned `RangeError: Maximum call stack size exceeded` from repeated Base64 regex groups. Replaced with bounded character checking and canonical decode/re-encode equality; four 5MiB resources now reach the exact 20MiB budget, further images remain placeholders. Bad characters, padding, signature/MIME and size checks remain enforced.
- Test harness corrections: native macOS window height is clamped to 860px at 1440px width. The exact 1440x900 renderer case uses Playwright viewport emulation inside Electron; zoom uses the actual Electron zoom factor and asserts CSS viewport width. Fast synthetic progress is observed in the real DOM before clicking, avoiding missed 80ms fetch states. Scroll checks wait for a change from the previous scroll position, including after image screenshots. Neither fix increases timeouts or substitutes a fake DOM.

## Final commands and results

All commands ran from the repository root. Network-capable tests used the approved local test environment; all inputs/accounts/models were synthetic.

| Command | Final result |
| --- | --- |
| `pnpm --filter @harness-design/dsh-knowledge test` | 85/85 passed |
| `pnpm --filter @linxin666/dsh-client-ui-extension-center test` | 93/93 passed (last run used `DEBUG_PRINT_LIMIT=0` to bound failure output) |
| `pnpm --filter @harness-design/desktop test` | 246/246 passed |
| `pnpm --filter @harness-design/dsh-knowledge typecheck` | passed |
| `pnpm --filter @linxin666/dsh-client-ui-extension-center typecheck` | passed |
| `pnpm --filter @harness-design/dsh-knowledge build` | passed |
| `pnpm --filter @linxin666/dsh-client-ui-extension-center build` | passed, including final capture CSS |
| `pnpm --filter @harness-design/desktop test:knowledge:e2e` | 7/7 passed, no renderer errors |
| `pnpm --filter @harness-design/desktop test:composer:e2e` | 15/15 Chinese states passed |
| `DSH_COMPOSER_LOCALE=en pnpm --filter @harness-design/desktop test:composer:e2e` | 15/15 English states passed |
| `pnpm --filter @harness-design/desktop test:acceptance` | 5/5 passed; intentional restart transport disconnects classified by the existing script |
| `git diff --check` | passed |

Build emitted existing tsdown deprecation/module-type warnings, with no build errors. New public article-text/article-images exports and the generated store chunk resolve. The lockfile agrees with the workspace knowledge link and official default-model SDK dependency; the existing connector SDK entry is preserved. No dependency installation or node_modules modification was needed. Old unreferenced generated chunks already present in the mixed working tree were preserved; the active build imports `store-Q7PB7jnu.js`.

## Screenshot and measurement evidence

All paths below contain only synthetic fixtures and are temporary local artifacts, not release files.

- Final knowledge run: `/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-knowledge-reading-artifacts-iiYI3q/`. Includes capture, summary, original/cached image, unavailable-image placeholder, confirmed card, four viewport cases, summary error, save-close and offline cache reopen screenshots.
- Chinese composer final geometry and 15 screenshots: `/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-composer-artifacts-fGtnUW/`.
- English composer final geometry and 15 screenshots: `/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-composer-artifacts-58E2CW/`.
- Opened and inspected all composer states using cropped contact sheets at `/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-composer-review-O52mpO/composer-states.png` and `/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-english-review-ECSBN7/english-states.png`.
- Reader state/viewport contact sheets from the pre-capture-fix run: `/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-reading-review-TZB5T8/`. These exposed the capture defect; they are not final capture acceptance. The corrected capture and unavailable-image screenshots were then opened directly from the final knowledge run above.

## Remaining external acceptance boundary and stop

- Real selected providers, real stream refusals specific to those providers and real public-account CDN/auth/network conditions are not verified. Synthetic finish/error coverage does not establish the cause of the user's original real-model failure. No model/token limits were guessed or enlarged.
- Cached images use anonymous public HTTP(S); cookie- or login-dependent images may remain unavailable. SVG/HTML are refused. The renderer reads validated cache data and does not request source images. Network-blocked reopen keeps the local application transport online; it does not simulate stopping the local host.
- Existing dismiss semantics retain historical records, snapshots and images. There is no hard-delete knowledge API to extend; failed uncommitted imports clean orphan resources. This preserves the plan's no-user-data-deletion boundary.
- 1440x900 is an exact Electron renderer viewport test, not a claim that this Mac can display a native 900px-tall window in its current work area. Installed official SDK selector changes will require rerunning composer geometry tests.
- Task 12 is the stopping point. No commit, push, DMG, release, or TAPD/iWiki real-account operation was performed. Packaging and real account/provider acceptance require a separate user instruction.
