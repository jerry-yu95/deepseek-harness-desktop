# My Brain Knowledge Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a local-first “我的大脑” knowledge loop where Harness agents may propose reusable knowledge from real work, but only the user can confirm it into a durable personal knowledge base.

**Architecture:** Add an independent `dsh-knowledge` Host plugin that owns the domain model, atomic local persistence, loopback RPC, and an agent-facing proposal tool. Reuse the existing Extension Center shell only as a renderer host for a first-class sidebar entry and review UI. Keep candidates separate from confirmed knowledge, require provenance for every record, and avoid changing official `@deepseek-ai/*` packages.

**Tech Stack:** DeepSeek Harness Cordis plugins, `@deepseek-ai/dsh-tools`, client connection RPC, TypeScript, React, Vitest, pnpm workspace, tsdown.

---

## Product boundary

This is not a generic notes editor and not an automatic transcript archive. The differentiating loop is:

1. The user completes real work in a project or conversation.
2. The agent identifies one bounded, reusable insight and proposes it as a candidate.
3. The product shows the candidate with type, project, confidence, and source evidence.
4. The user confirms, edits later, or dismisses it.
5. Only confirmed items appear in durable knowledge search and future review surfaces.

The MVP deliberately does not ingest full conversations, expose hidden reasoning, generate embeddings, sync to cloud, or draw a graph. Those require separate privacy, retention, and retrieval decisions.

## Domain model

### Knowledge candidate

- `id`: opaque `knowledge_*` identifier.
- `status`: `candidate`, `confirmed`, or `dismissed`.
- `kind`: `decision`, `lesson`, `method`, `fact`, or `preference`.
- `title`: concise human-readable statement.
- `content`: bounded reusable knowledge, not a full transcript.
- `project`: optional workspace label or path-safe project identifier.
- `tags`: normalized, bounded labels.
- `confidence`: number from 0 to 1; advisory only.
- `source`: required provenance with source kind, visible label, optional session id, and captured time.
- `createdAt`, `updatedAt`, `confirmedAt`, `dismissedAt`: ISO timestamps as applicable.

### Trust rules

- Agent tools may only create `candidate` records.
- Promotion and dismissal require loopback UI RPC and are never agent-tool actions.
- Confirm and dismiss transitions are idempotent but cannot resurrect dismissed records.
- Every item has source evidence. Missing provenance is rejected.
- Content, titles, tags, and identifiers have explicit count and length limits.
- Local persistence uses owner-only directories/files and atomic rename.
- RPC/tool errors are projected through bounded, secret-safe messages.

## Storage layout

Default root:

`$DSH_HOME/desktop/knowledge/v1/`

Files:

- `items/<knowledge-id>.json`: one validated item per file.
- No raw transcript copy in MVP.
- No API key, cookie, authorization header, hidden reasoning, or full attachment content.

Per-record files simplify atomic transitions and future indexing. A later version may add a derived search index, but the record files remain the source of truth.

## User experience

Add a first-level sidebar row named `我的大脑`. It opens a dedicated surface rather than appearing as another Extension Center tab.

MVP sections:

- `待确认`: candidate cards with Confirm and Dismiss.
- `已沉淀`: confirmed knowledge cards.
- Empty-state explanation: “智能体可以提出建议，只有你确认后才会进入知识库。”
- Refresh action and safe degraded state when the Host connection is unavailable.

Future sections, intentionally not in this implementation batch:

- 今日沉淀
- 知识网络
- 项目记忆
- 成长复盘
- 可复用能力 / Agent Packs

## Task 1: Scaffold domain package and failing tests

**Files:**

- Create: `packages/dsh-knowledge/package.json`
- Create: `packages/dsh-knowledge/cordis.patch.yml`
- Create: `packages/dsh-knowledge/tsconfig.json`
- Create: `packages/dsh-knowledge/tsdown.config.ts`
- Create: `packages/dsh-knowledge/vitest.config.ts`
- Create: `packages/dsh-knowledge/src/core/types.ts`
- Create: `packages/dsh-knowledge/src/core/validate.ts`
- Create: `packages/dsh-knowledge/tests/validate.test.ts`

**Step 1: Write the failing validation tests**

Cover valid candidates, missing provenance, unsupported kinds, overlong title/content, invalid confidence, duplicate/invalid tags, and caller-supplied lifecycle timestamps.

**Step 2: Run the targeted test**

Run: `pnpm --filter @harness-design/dsh-knowledge test -- validate.test.ts`

Expected: FAIL because the validator is not implemented.

**Step 3: Implement the smallest validator**

Return normalized domain records and reject all unknown lifecycle fields from proposal input.

**Step 4: Run the targeted test again**

Expected: PASS.

## Task 2: Implement atomic local repository

**Files:**

- Create: `packages/dsh-knowledge/src/core/store.ts`
- Create: `packages/dsh-knowledge/tests/store.test.ts`

**Step 1: Write failing repository tests**

Cover:

- proposal creates a `candidate` record;
- list sorts newest first and filters by status;
- confirm transitions candidate to confirmed;
- dismiss transitions candidate to dismissed;
- dismissed records cannot be confirmed;
- damaged or path-invalid records never escape the storage root;
- concurrent writes leave valid JSON;
- storage permissions and temporary files are safe.

**Step 2: Run the test**

Run: `pnpm --filter @harness-design/dsh-knowledge test -- store.test.ts`

Expected: FAIL.

**Step 3: Implement repository operations**

Use `$DSH_HOME` or `~/.dsh`, owner-only mode, one record per file, and atomic rename. Validate both writes and reads.

**Step 4: Run the test again**

Expected: PASS.

## Task 3: Register Host RPC and agent proposal tool

**Files:**

- Create: `packages/dsh-knowledge/src/wire.ts`
- Create: `packages/dsh-knowledge/src/index.ts`
- Create: `packages/dsh-knowledge/tests/plugin.test.ts`

**Step 1: Write failing Host contract tests**

Cover:

- RPC `list`, `confirm`, and `dismiss` projections;
- unknown endpoint handling;
- `knowledge_propose` tool only creates candidate records;
- tool output excludes storage paths and secret-like fields;
- prompt guidance explains suggestion-first semantics.

**Step 2: Run the test**

Run: `pnpm --filter @harness-design/dsh-knowledge test -- plugin.test.ts`

Expected: FAIL.

**Step 3: Implement Host registration**

Register a loopback RPC channel and one `knowledge_propose` tool. Do not expose confirm/dismiss as tools. The system prompt should request sparse, reusable proposals and prohibit transcript dumping.

**Step 4: Run the test again**

Expected: PASS.

## Task 4: Register the runtime package

**Files:**

- Modify: `apps/dsh-desktop/src/profile.mjs`
- Modify: `packages/dsh-web-ui-all/aggregate.yml`
- Modify: `packages/dsh-web-ui-all/package.json`
- Modify: `packages/dsh-web-ui-all/cordis.patch.yml` (generated)
- Modify: `pnpm-lock.yaml`
- Modify: `apps/dsh-desktop/test/profile.test.mjs` only if an explicit expectation needs the new package.

**Step 1: Add workspace dependency and aggregate row**

Use `@harness-design/dsh-knowledge` and Cordis id `knowledge`.

**Step 2: Regenerate aggregate output**

Run: `node scripts/aggregate.mjs`

**Step 3: Update the lockfile without broad upgrades**

Run: `pnpm install --lockfile-only`

**Step 4: Verify registration**

Run: `node scripts/aggregate.mjs --check`

Expected: all rows and dependencies match.

## Task 5: Add the first-class My Brain client entry

**Files:**

- Create: `packages/dsh-knowledge/src/client/api.ts`
- Create: `packages/dsh-knowledge/src/client/index.ts`
- Modify: `packages/dsh-knowledge/package.json`
- Modify: `packages/dsh-knowledge/tsdown.config.ts`
- Modify: `packages/dsh-extension-center/package.json`
- Modify: `packages/dsh-extension-center/src/client/panel/controller.ts`
- Modify: `packages/dsh-extension-center/src/client/sidebar-entry.ts`
- Modify: `packages/dsh-extension-center/src/client/panel/ExtensionPanel.tsx`
- Create: `packages/dsh-extension-center/src/client/panel/KnowledgeTab.tsx`
- Modify: `packages/dsh-extension-center/src/client/panel/panel.module.css`
- Modify: `packages/dsh-extension-center/src/client/locales.ts`
- Modify: `packages/dsh-extension-center/src/client/index.ts`
- Modify: `packages/dsh-extension-center/tests/controller.test.ts`
- Create: `packages/dsh-extension-center/tests/knowledge-tab.test.tsx`

**Step 1: Write failing controller and UI tests**

Assert `knowledge` is a valid first-level destination, the dedicated title is `我的大脑`, candidates show provenance, and confirm/dismiss refreshes the list.

**Step 2: Implement client API and UI**

Use official client connection RPC. Keep the sidebar row top-level. For the knowledge destination, hide the Skills/Connectors/Learning tab bar and render the dedicated My Brain surface.

**Step 3: Run targeted tests**

Run:

- `pnpm --filter @harness-design/dsh-knowledge test`
- `pnpm --filter @linxin666/dsh-client-ui-extension-center test`

Expected: PASS.

## Task 6: Build and regression verification

**Step 1: Typecheck and build the new package**

Run:

- `pnpm --filter @harness-design/dsh-knowledge typecheck`
- `pnpm --filter @harness-design/dsh-knowledge build`

**Step 2: Verify dependent UI**

Run:

- `pnpm --filter @linxin666/dsh-client-ui-extension-center typecheck`
- `pnpm --filter @linxin666/dsh-client-ui-extension-center test`
- `pnpm --filter @linxin666/dsh-client-ui-extension-center build`

**Step 3: Verify desktop integration**

Run:

- `node scripts/aggregate.mjs --check`
- `pnpm desktop:test`
- `pnpm typecheck`
- `git diff --check`

**Step 4: Security and policy scan**

Confirm no changes under `node_modules/@deepseek-ai`, no emoji in new/modified source and docs, no transcript persistence, and no confirm/dismiss agent tool.

## Manual acceptance

1. Start desktop dev mode and open `我的大脑` from the sidebar.
2. Verify the empty state explains that confirmation is required.
3. Ask the agent to propose one reusable lesson from the current project.
4. Verify the candidate appears with source, type, project, and confidence.
5. Confirm it and verify it moves to `已沉淀` after refresh.
6. Propose another item, dismiss it, and verify it disappears from pending and never appears as confirmed.
7. Restart Harness and verify confirmed knowledge persists locally.
8. Verify Skills, Connectors, Learning, conversation composer hiding, attachments, and connector import still behave normally.

## Rollback

Remove `dsh-knowledge` from the aggregate and desktop runtime package list, then remove the knowledge sidebar destination. Existing knowledge files remain inert under `$DSH_HOME/desktop/knowledge/v1` and may be retained for a later build or deleted explicitly by the user.

## Non-goals for this batch

- Full conversation import or automatic transcript retention.
- Embeddings, vector database, semantic graph, cloud sync, or team sharing.
- Periodic scheduled reviews and notifications.
- Automatic Skill or Agent Pack generation.
- Editing confirmed knowledge in place.
- DMG packaging, release version bump, commit, push, tag, or GitHub Release.
