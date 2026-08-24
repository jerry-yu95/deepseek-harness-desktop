# DeepSeek Harness Desktop

[中文](README.md) | English

![dsh-web-ui](docs/dsh-web-ui-banner.png)

## Cross-platform Desktop

DeepSeek Harness Desktop brings the complete DSH Web surface to native Windows and macOS applications. It does not rewrite the interface: a hardened Electron window launches the official `@deepseek-ai/dsh` host locally and loads this repository's desktop extensions. Releases are built separately for Windows x64, macOS Intel, and macOS Apple Silicon.

[Download the latest installer](https://github.com/jerry-yu95/deepseek-harness-desktop/releases/latest) · [Installation guide](docs/install.en.md) · [Desktop technical guide](docs/desktop.md) · [Changelog](CHANGELOG.md)

Current development version: `0.1.35`. This release focuses on connector lifecycle management, official JSON onboarding, context-usage visibility, and long-context compaction-quality benchmarks; real service authorization still depends on the user's own account and permissions.

## Why this project exists

DeepSeek Harness is more than a chat interface: it is an Agent runtime for composing models, tools, permissions, Skills, workflows, and plugins. This project does not replace that runtime. It adds the product layer everyday users need: installation, understandable controls, extensibility, remote access, observability, and recovery.

- **Official foundation stays intact**: the official Agent Loop, Cordis, permissions, and plugin semantics remain the source of truth, while official-core and community-desktop updates stay separate;
- **Extension Center**: Skills, MCP/HTTP connectors, and learning live in the official sidebar with creation, import, diagnostics, and removal in one place;
- **Official JSON first**: discover local WorkBuddy, CodeBuddy, TRAE, and Qoder MCP configs or paste a provider's `mcpServers` JSON and fill only missing credentials;
- **Agent Harness layer**: select Standard, Adaptive, or Enhanced orchestration and inspect cache hits, Agent traces, model health, and period-based Token usage;
- **Real desktop delivery**: Windows x64, macOS Intel, and Apple Silicon packages with isolated configuration, safe updates, and rollback;
- **Clear open-source boundary**: community features are not presented as official DeepSeek capabilities, and third-party licensing and attribution are preserved.

The project's core position is an open-source Agent workbench above the official Harness runtime: it preserves DeepSeek Harness execution semantics while making connectors, Skills, orchestration, caching, remote control, observability, and cross-platform delivery understandable, installable, and testable for everyday users.

| Lossless original surface | Desktop Extension Dock |
| --- | --- |
| ![Desktop startup](docs/screenshots/desktop-startup.png) | ![Plugin and skill Extension Dock](docs/screenshots/desktop-extension-dock.png) |

- Keeps the task board, Git graph, right panel, SSH, mobile remote, live stats, pet, and custom image themes;
- Uses an isolated `desktop` profile without overwriting an existing DSH setup, and binds only to loopback;
- Adds crash recovery, sanitized rotating logs, window-state restore, strict navigation, and denied-by-default permissions;
- Adds an Extension Center for Skill creation/import, official MCP JSON, external-client config discovery, connector diagnostics, and transactional community DSH bundle management;
- Bundles official DSH, pnpm, and native dependencies, so users do not need a separate Node.js installation.

## Extension Center

The Skills, Connectors, and Learn sidebar entries are provided by the community desktop plugin:

- **Skills** lists discovered Harness Skills, creates valid `SKILL.md` bundles, and imports existing skill directories. A Skill is an Agent playbook, not an MCP server or Cordis runtime plugin;
- **Connectors** offers verified GitHub, Feishu/Lark, and GitLab MCP templates, arbitrary official `mcpServers` JSON import, and one-click discovery for WorkBuddy, CodeBuddy, TRAE, and Qoder;
- **Learn** explains the five Harness layers, permissions, modes, plugin boundaries, and the product reasoning behind every community enhancement in plain language.

The connector catalog distinguishes official MCP templates, provider-supplied JSON configuration, official Skills, and API/OAuth guidance. Source verification is not a claim that a real account has been authorized end to end; the app reports configuration, credentials, runtime reachability, and Harness registration as separate diagnostics.

Credentials are encrypted in the desktop main process and never written into connector records, generated profiles, logs, or exported JSON. Diagnostics report configuration, credentials, runtime reachability, and Harness registration as separate stages.

The public build does not use paid code-signing certificates, so Windows SmartScreen or macOS Gatekeeper may report an unknown publisher. Download only from this project's Releases and verify SHA-256. Windows supports in-app updates; macOS detects new versions and opens this project's Release page for manual installation. See the [installation guide](docs/install.en.md).

This repository also maintains a collection of DeepSeek Harness (DSH) Web UI extensions: a task board, Git graph, right panel, mobile remote control, remote connection, whale-girl pet, live token statistics, and custom image themes. Desktop installers already include these capabilities; the standalone plugin instructions below are for developers with an existing DSH environment.

![DSH Web UI main screen](docs/screenshots/13-hero-main.png)

## Feature Plugins

### Task Board

Open it from the sidebar. Tasks are organized into five columns: Planned, To-do, In Progress, Done, and Failed. Clicking "Run" on a card hands the task to a real DSH agent session; when it finishes, the card status updates automatically. To review what happened, jump directly into the execution session for the full transcript.

Tasks also support scheduled execution: configure a cron expression in the detail view (e.g. auto-upgrade DSH at 23:00 daily, generate a weekly report at 09:00 every Monday), and the task runs on its own at the scheduled time.

| Multi-column board | Scheduled execution |
| --- | --- |
| ![Task board](docs/screenshots/09-task-board.png) | ![Scheduled task detail](docs/screenshots/10-task-board-detail-cron.png) |

### Git Graph

The branch picker above the input box handles branch switching and commit history browsing; the Git graph visualizes branch lanes and commit history, making it easy to trace changes along the timeline even in large repositories.

![Git graph](docs/screenshots/04-git-graph.png)

### Right Panel

When a project session is open, two panels appear to the right of the chat area — "Preview" and "Files/Changes":

- **File tree**: browse the working directory; click a file to open it in the preview panel, click a folder row to expand it, and search for files by name;
- **Preview**: multi-tab preview for markdown, HTML, code, diff, CSV, PDF, Office, images and plain text, with source/preview switching, split-screen editing and saving;
- **Changes (SCM)**: a real git changes panel with stage / unstage / discard;
- Panel widths are draggable (double-click a handle to reset), and the collapsed state plus widths persist per project;
- Custom image themes adapt the right panel while automatically preserving readable contrast.

![Right panel](docs/screenshots/19-right-panel.png)

### Whale-Girl Pet

A whale girl who lives at the edge of the interface and switches animations with the agent's state: thinking, waiting, working, celebrating. Click her to interact (pet her head), feed her dried fish to raise affinity, and grow her from a baby whale to "deep-sea bond". She can be renamed, dragged to any position, or hidden whenever you want.

| Working companion | Interaction panel |
| --- | --- |
| ![Whale pet](docs/screenshots/11-pet-new-chat.png) | ![Pet interaction panel](docs/screenshots/12-pet-panel.png) |

### Live Token Stats

Real-time usage shown directly below the input box: generation speed (TPS), LLM time, context usage, cache hit rate, and input / output token counts — the cost of every generation stays visible at a glance.

![Live token stats](docs/screenshots/18-live-stats.png)

### Mobile Remote Control

The phone icon at the bottom of the sidebar opens the pairing panel: scan the QR code (or copy the link) to pair, and the phone lands on a standalone mobile surface that remote-controls the current dsh web workspace — browse and create sessions, send and receive messages, switch models and reasoning effort, and adjust the permission preset, all in sync with the desktop. Pairing tokens are one-time and time-limited; "Stop" revokes every paired device at any time. The QR defaults to the LAN, or turn on the cloudflared public tunnel so the phone can pair from any network.

| Workspaces | Sessions & new session |
| --- | --- |
| ![Mobile workspaces](docs/screenshots/20-mobile-workspaces.png) | ![Mobile sessions](docs/screenshots/21-mobile-sessions.png) |
| Chat (folded reasoning & tool calls) | Model & reasoning-effort picker |
| ![Mobile chat](docs/screenshots/22-mobile-chat.png) | ![Model picker](docs/screenshots/23-mobile-model-sheet.png) |

### Remote Connection

The "SSH" sidebar entry opens the remote-ops panel. Hosts support key / password auth and one-click import from `~/.ssh/config`; config lives in `~/.dsh/dsh-ssh.json`. Real operations on configured hosts:

- **Web terminal**: xterm.js PTY with live output and auto-fit;
- **File transfer**: SFTP upload / download with progress and a remote directory browser;
- **Port forwarding**: local tunnels to remote internal services (databases, APIs, admin consoles), bound to 127.0.0.1 only;
- **Cluster runs**: one command across many hosts concurrently, filtered by alias / environment / tags;
- **Agent direct control**: agents share the same host config — just say "check xxx" in chat and the agent runs remote commands for you.

### Settings Hub

All family plugins' toggles and parameters live under "Settings > Plugin config", and changes apply immediately.

![Plugin config hub](docs/screenshots/02-settings-web-ui-plugins.png)

## Custom image theme

The desktop profile no longer enables the fragile preset skins by default. Upload an image under **Settings → Plugin config → Web UI plugins → Custom theme** and the app derives readable light/dark colors, contrast, and an adjustable background overlay. The image and generated theme remain local, and one click restores the official appearance.

## Installation

DSH plugins are installed per **profile** with the `dsh plugin` command (`dsh web` runs the `web` profile). The recommended way is the aggregate package `dsh-web-ui-all` — one package with all plugins and skins; install `dsh-skins` instead if you only want the skins.

### Option 1: Install from npm (recommended)

The plugins are published to npm (the `@linxin666` scope) — one command installs everything:

```sh
dsh plugin --profile web add @linxin666/dsh-web-ui-all
```

Restart `dsh web` and all plugin entries appear in the sidebar. Skins only? Install `@linxin666/dsh-skins` instead.

> First install may stop on `ERR_PNPM_IGNORED_BUILDS` (pnpm blocks dependency build scripts): copy the printed keys (`cloudflared` / `cpu-features` / `ssh2`) into the profile's `pnpm-workspace.yaml` `allowBuilds` list and re-run.

### Option 2: Install from the GitHub repository (development)

The packages are already on npm; installing from this repository is only for development (requires Node.js >= 22 and pnpm):

```sh
# 1. Clone the repository
git clone https://github.com/jerry-yu95/deepseek-harness-desktop.git
cd deepseek-harness-desktop

# 2. Install dependencies and build
pnpm install
pnpm -r build

# 3. Install the aggregate package into the web profile
dsh plugin --profile web add link:$(pwd)/packages/dsh-web-ui-all

# 4. Restart dsh web — all plugin entries appear in the sidebar
dsh web
```

> Skins only? Point step 3 at `packages/dsh-skins` instead.

### Install a single plugin

Prefer individual plugins? Install them one by one (published on npm, so use the package name directly):

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-task-board   # Task board
dsh plugin --profile web add @linxin666/dsh-ssh                    # Remote connection (SSH)
dsh plugin --profile web add @linxin666/dsh-pet                    # Whale-girl pet
```

### Verify and uninstall

After installing, restart `dsh web` — a working plugin shows up in the sidebar. You can also confirm the mounted config layers with `dsh --profile web --dump-config`. If nothing appears in the sidebar, you most likely forgot to restart `dsh web`.

Uninstall: `dsh plugin --profile web remove @linxin666/dsh-web-ui-all`, then restart `dsh web`.

Technical details live in [docs/plugins.md](docs/plugins.md).

## Sources & Licensing

| Package | Origin | License |
| --- | --- | --- |
| dsh-task-board / dsh-git-graph / dsh-aionui-panel / dsh-pet / dsh-remote-web-ui / dsh-live-stats / dsh-web-ui-settings / dsh-skins / dsh-web-ui-all / skins | Authored by zhu1090093659 | BSD-3-Clause (zhu1090093659) |

Third-party code merged in must keep its LICENSE and attribution; active third parties with an upstream are forked or referenced as dependencies instead of vendored.
