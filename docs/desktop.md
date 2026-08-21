# DeepSeek Harness Desktop

## Architecture

The desktop application is a thin lifecycle and security layer around the official DSH host. Electron starts `@deepseek-ai/dsh` with `--profile desktop --port 0`, waits for the official loopback URL line, probes HTTP readiness, and then loads that URL into the main window. The Web application, protocols, data paths, tools, and plugin system remain DSH implementations.

The managed profile lives at `~/.dsh/profiles/desktop`. It composes `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, and `@deepseek-ai/dsh-web-ui-all`, while preserving community bundles already added to the desktop profile. Existing default profiles are not changed.

## Included desktop capabilities

| Area | Behavior |
| --- | --- |
| Runtime | Official DSH host, random loopback port, HTTP readiness probe, graceful stop, bounded automatic restart |
| Web surface | Original DSH Web application and complete dsh-web-ui plugin/skin aggregate |
| Recovery | Startup status, sanitized recent error, retry, profile repair, logs, exit |
| Mobile remote | One-time QR pairing; loopback runtime plus opt-in personal-device tunnel; durable post-restart intent, background reconnect with backoff, and desktop diagnostics for runtime, pairing route, and tunnel state |
| Plugins | Registry package syntax only, protected built-ins, serialized pnpm changes, DSH bundle validation, rollback |
| Skills | Project/DSH/Agents root discovery, official precedence, shadow reporting, safe folder import |
| Window | Single instance, persisted visible geometry, native menu, download destination prompt |
| Security | Sandbox, context isolation, no Node integration, loopback navigation allowlist, denied permissions |

## Performance and size

Reference measurements on the Windows 11 development machine for version 0.1.0:

| Measurement | Result |
| --- | ---: |
| Test suite | 26 passing tests |
| Installer | 187.5 MiB |
| Installed/unpacked runtime | about 603 MiB |
| Fresh profile and cold file scan | about 30.5 seconds |
| Warm application start | about 7.1 seconds |

The large installed size is intentional: the release keeps the official DSH runtime, Chromium, terminal/native modules, SSH, remote UI, all plugin packages, and all skins. The first start may be slower while Windows scans newly installed files and the desktop profile is created. Later starts reuse both the installed files and profile links.

## Installation

Download the x64 installer from GitHub Releases and verify its SHA-256 against `SHA256SUMS.txt`. The build is currently unsigned, so SmartScreen may display an unknown publisher. The default per-user location is recommended. Custom installation roots should be kept short because some transitive native tooling still depends on the legacy Win32 260-character path limit.

No separate Node.js or pnpm installation is required for release users.

## Extension Dock

Open `Tools > Extension Dock` from the native menu.

Plugin installation accepts an npm registry package such as `@scope/dsh-bundle@1.2.3`. URL, path, whitespace, shell metacharacter, and option-like input is rejected. The package must declare a DSH bundle patch. Built-in packages cannot be removed.

The Official Core tab checks npm and the upstream DeepSeek Harness repository separately. npm versions can be installed with a profile backup and runtime rollback. A GitHub commit can be synchronized into an isolated source snapshot after manifest validation; it is not activated automatically and is not yet a source build/install path.

Skill discovery scans project `.dsh/skills`, project `.agents/skills`, user DSH skills, and user Agents skills in precedence order. Import copies one validated skill folder into `~/.dsh/skills` without overwriting an existing name.

## Build from source

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm desktop:test
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
pnpm desktop:pack
pnpm --filter @harness-design/desktop pack:verify
```

Use Node.js 24 and pnpm 11.21.0. The installer is written to `apps/dsh-desktop/dist`.
