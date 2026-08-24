# Connector Authorization Roadmap: Desktop 0.1.36-0.1.38

## Outcome

Turn the current connector catalog and secure JSON importer into a live-verified connector platform with real authorization, official provider integrations, recoverable credential lifecycle, and evidence-based store tiers.

## Version sequence

| Version | Scope | Exit gate |
| --- | --- | --- |
| 0.1.36 | GitHub, Feishu/Lark, GitLab, DingTalk real-account authorization | Four redacted live matrices plus deterministic cross-platform tests |
| 0.1.37 | TAPD/Gongfeng provider JSON; Tencent Meeting/WeCom official Skills | Exact provider sources verified, four read-only live operations pass |
| 0.1.38 | Expiry, revocation, disconnect, reconnect; connector store tiers | Lifecycle simulations pass on three platforms and tier claims match evidence |

## Dependency order

```text
0.1.35 secure JSON + encrypted secrets + catalog
  -> 0.1.36 provider auth adapters and live evidence
    -> 0.1.37 official JSON/Skill installation and live evidence
      -> 0.1.38 common lifecycle manager and evidence-based store
```

Do not begin 0.1.38 provider lifecycle work with fake adapters standing in for unfinished 0.1.36/0.1.37 integrations. Pure state-machine and manifest work may start earlier, but provider claims must wait for live evidence.

## Shared engineering rules

1. Preserve the official DeepSeek Harness runtime and `dsh-mcp-client` execution path.
2. Keep all credentials in the desktop main process and encrypted OS-backed storage.
3. Never place live credentials in Git, CI, screenshots, logs, issue text, or evidence files.
4. Use disposable/least-privilege accounts and read-only operations for the first live checks.
5. Treat provider documentation and account-generated JSON as authoritative. Community implementations may become community-tier entries but cannot establish an official claim.
6. Every provider action must fail closed with an actionable, localized diagnostic.
7. Every release is independently installable and reversible; do not combine all three versions into one oversized commit.
8. Deep migration for WorkBuddy, CodeBuddy, TRAE, and Qoder remains deferred and is not part of these versions.

## Plans

- `docs/plans/2026-08-24-0.1.36-live-account-authorization.md`
- `docs/plans/2026-08-24-0.1.37-provider-json-official-skills.md`
- `docs/plans/2026-08-24-0.1.38-connector-lifecycle-store.md`

## Handoff to GPT 5.6 Luna High

Start with the 0.1.36 preflight and execute one task at a time. At each commit checkpoint:

1. inspect `git status --short` and preserve unrelated user changes;
2. run the focused failing test before implementation;
3. implement the minimum required behavior;
4. run focused tests, then the package suite;
5. scan for credential leakage;
6. commit only the files listed by that task;
7. stop for user-provided account authorization when a live gate is reached.

The implementation agent may update exact provider details only after checking current provider-owned documentation. Any change in auth mode, package URL, command, permission scope, or support status must be reflected in catalog metadata, tests, and release notes.
