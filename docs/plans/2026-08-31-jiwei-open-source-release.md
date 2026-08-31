# JIWEI 0.1.43 Open-source Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebrand the public project as the original product “积微 JIWEI”, replace inherited promotional copy and screenshots with verified 0.1.43 material, and publish the source plus cross-platform release assets.

**Architecture:** Keep DeepSeek Harness as the clearly attributed upstream runtime and retain all required third-party licenses. Change only project-owned product surfaces, repository documentation, release metadata, and generated artwork; never rewrite third-party authorship. The current dirty workspace is intentionally used because it contains the already tested 0.1.43 release candidate that is not present in any other worktree.

**Tech Stack:** Markdown, SVG/PNG, Electron, electron-builder, Playwright, pnpm, GitHub Actions, GitHub Releases.

---

### Task 1: Freeze the provenance and release inventory

**Files:**
- Modify: `NOTICE.md`
- Create: `THIRD_PARTY_NOTICES.md`

1. Inventory root and per-package license owners, upstream DeepSeek Harness dependencies, npm scopes, promotional screenshots, and release artifacts.
2. Separate project-owned work from inherited `dsh-web-ui` packages without deleting required BSD/MIT notices.
3. Verify the release candidate version is `0.1.43` in the workspace and desktop package.
4. Run `git diff --check`; expect no whitespace errors.

### Task 2: Establish the JIWEI identity

**Files:**
- Modify: `apps/dsh-desktop/electron-builder.yml`
- Modify: `apps/dsh-desktop/src/main.mjs`
- Modify: `apps/dsh-desktop/src/ui/startup.html`
- Modify: `apps/dsh-desktop/src/ui/extensions.html`
- Modify: `apps/dsh-desktop/src/app-update-ipc.mjs`
- Modify: `packages/dsh-extension-center/src/client/locales.ts`
- Modify: `.github/workflows/desktop-release.yml`
- Modify: relevant tests and installation documentation

1. Rename project-owned visible product surfaces to `积微 JIWEI` while retaining the existing application identifier for upgrade compatibility.
2. Rename newly generated installer artifacts to `JIWEI-*` and update workflow globs and package-verification paths.
3. Add the positioning line “会行动，也会沉淀的个人 Agent 工作台” and the slogan “让每一次思考，长成自己的认知世界。” only to project-owned surfaces.
4. Update tests before implementation when an asserted product or artifact name changes.
5. Run focused desktop tests; expect all tests to pass.

### Task 3: Replace the public README and artwork

**Files:**
- Replace: `README.md`
- Replace: `README.en.md`
- Create: `docs/brand/jiwei-banner.svg`
- Create: `docs/brand/jiwei-banner.png`
- Create: `docs/screenshots/jiwei-*.png`

1. Write an original Chinese README around JIWEI’s product thesis, verified 0.1.43 capabilities, architecture boundary, quick start, security model, roadmap, and contribution path.
2. Write the matching English README without translating inherited promotional material.
3. Generate a project-owned banner from original vector primitives and the JIWEI identity.
4. Capture only the current application’s real, sanitized 0.1.43 surfaces; do not reuse existing third-party promotional screenshots.
5. Visually inspect every generated PNG and verify that no personal token, local path, account, or unrelated project name is visible.

### Task 4: Prepare release notes and repository metadata

**Files:**
- Modify: `CHANGELOG.md`
- Replace: `docs/launch/release-notes.md`
- Modify: `docs/install.md`
- Modify: `docs/install.en.md`
- Modify: `package.json`
- Modify: `apps/dsh-desktop/package.json`

1. Describe only capabilities backed by code or deterministic tests.
2. State unsupported or account-dependent behavior explicitly.
3. Update repository description and topics after the source push.
4. Ensure documentation identifies the project as an unofficial community product built on DeepSeek Harness.

### Task 5: Verify the complete release candidate

1. Run `pnpm test`; expect all workspace tests to pass.
2. Run `pnpm typecheck`; expect all workspace type checks to pass.
3. Run `pnpm build`; expect every workspace package to build.
4. Run `pnpm aggregate:check` and `git diff --check`; expect success.
5. Build `pnpm --filter @harness-design/desktop pack:mac:arm64` and verify the packaged resources.
6. Mount-test the DMG and calculate SHA-256 checksums.
7. Scan tracked changes and screenshots for credentials, access tokens, cookies, private keys, and user-specific absolute paths; expect no release-blocking findings.

### Task 6: Publish source and installers

1. Commit the 0.1.43 product implementation separately from the JIWEI public-brand packaging when practical.
2. Push `main` to `origin`.
3. Create and push annotated tag `desktop-v0.1.43`.
4. Let `.github/workflows/desktop-release.yml` build Windows x64, macOS x64, and macOS arm64 assets and publish the GitHub Release.
5. Verify the GitHub Release contains installers, update metadata, and `SHA256SUMS.txt` before reporting completion.
