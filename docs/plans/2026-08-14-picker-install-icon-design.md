# Directory Picker, Installer, and App Icon Design

## Goals

- Eliminate the Windows error `win32 folder dialog worker exited before reporting a result` without modifying DeepSeek Harness source code.
- Reduce real Windows installation time while retaining the complete Web UI, plugin, skill, SSH, terminal, and native-module runtime.
- Replace the current cyber-style mark with a cute, anthropomorphic DeepSeek whale-girl icon that remains readable at Windows shortcut sizes.
- Ship the changes as a reproducible, verified, open-source desktop release.

## Evidence and constraints

The reported directory-picker error originates in the official `@deepseek-ai/dsh-host-directory-picker-native` package. Its Windows implementation launches a Koffi/COM worker process and raises the error when that worker exits without returning a folder. DSH also ships official host and client packages for an in-app directory browser, so the desktop profile can select those packages without patching official source.

The 0.1.1 installer expands 17,489 files. A controlled extraction benchmark on the reference Windows machine measured 74.04 seconds for the existing LZMA installer. Enabling the NSIS `useZip` option alone produced a 190.65 MiB installer and took 85.15 seconds to extract, so changing compression format alone is rejected. File count and unnecessary payload are the dominant optimization targets.

The packaged DSH host is launched from a physical profile and relies on linked native and JavaScript packages. Moving all dependencies into ASAR would break that runtime model. Optimization must therefore preserve unpacked runtime packages and exclude only files proven not to participate in execution.

## Directory picker design

The desktop-managed profile will write a deterministic `cordis.patch.yml` that disables the auto-selected native picker and inserts the official browse picker pair:

```yaml
- id: directory-picker
  name: '@deepseek-ai/dsh-host-directory-picker-auto'
  disabled: true
- insert:
    - id: directory-picker-desktop-host
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: directory-picker-desktop-client
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

The host package supplies directory listing and creation. The client package supplies the modal UI and path editor. This removes the failing native worker boundary while retaining directory navigation, hidden-directory support, new-folder creation, and manual path entry.

The two browse packages will be explicit desktop runtime dependencies and managed profile links. Existing community bundles and dependencies remain untouched. Profile generation stays idempotent and upgrades an existing desktop profile by replacing only the desktop-managed patch file.

Tests will verify the exact patch, explicit package resolution, idempotent profile generation, effective Cordis configuration, and a packaged-runtime picker interaction where feasible.

## Installer optimization design

The release keeps normal NSIS compression because the ZIP experiment regressed installation time. Optimization instead uses a conservative release-file filter:

- remove source maps, tests, examples, changelogs, licenses duplicated inside dependencies, and package documentation from the packaged dependency tree;
- remove TypeScript declaration files and TypeScript source only when a package manifest does not expose or reference them at runtime;
- remove native artifacts for non-Windows or non-x64 targets;
- retain every package entry point, export target, JavaScript module, JSON asset, Web UI asset, shell asset, native x64 binary, and pnpm runtime file;
- retain third-party license attribution in the repository and release documentation.

A build hook will make the decision package by package from each manifest rather than using a broad global glob. It will produce a machine-readable pruning report. Release acceptance requires the packaged app to pass clean-profile startup, Web UI loading, plugin inventory, skill inventory, native terminal, and window interaction tests.

The final installer will be benchmarked with the same extraction procedure as 0.1.1. Success means a lower file count and a material improvement over the 74.04-second baseline without a runtime regression. If conservative pruning does not improve the result, correctness wins and the pruning change will not ship.

## Icon design

The new icon is a square chibi deep-sea whale girl: blue-cyan hair shaped like small fins, a whale-tail hair ornament, a friendly face, and a compact navy/cyan badge silhouette. It contains no text or watermark. The palette preserves DeepSeek recognition while the character treatment makes it warmer and more distinctive.

The generated source uses a flat chroma-key background, which is removed locally to produce clean transparency. The release assets include a high-resolution PNG and a multi-resolution ICO containing 16, 24, 32, 48, 64, 128, and 256 pixel representations. Each size is inspected for alpha edges, contrast, and silhouette clarity before replacing the existing icon.

## Failure handling and release gates

- If the browse packages cannot resolve from the packaged runtime, startup fails with the missing package name rather than silently reverting to the native picker.
- If pruning removes any required runtime file, the package verification suite fails and the exclusions are narrowed.
- If the new icon is illegible at small sizes, the source is regenerated or simplified before packaging.
- The release is blocked until unit tests, packaged verification, a real EXE launch, checksum generation, Git tag, GitHub release asset audit, and published release notes all succeed.
