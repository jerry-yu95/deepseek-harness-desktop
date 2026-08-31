# 积微 JIWEI

[中文](README.md) · [English](README.en.md)

![积微 JIWEI：让每一次思考，长成自己的认知世界](docs/brand/jiwei-banner.png)

> 会行动，也会沉淀的个人 Agent 工作台。

积微把 AI 对话、工具执行、项目上下文与个人知识沉淀放进同一个本地优先工作台。它以 DeepSeek Harness 为 Agent 运行底座，在其上提供桌面交付、文件附件、连接器、可观察编排和“我的大脑”知识闭环。

本项目是独立的社区开源项目，不是 DeepSeek 官方产品。“积微 / JIWEI”的品牌、产品设计、桌面整合与新增功能由本项目维护；DeepSeek、Harness 及相关标识归其权利人所有。

[下载最新版本](https://github.com/jerry-yu95/deepseek-harness-desktop/releases/latest) · [安装指南](docs/install.md) · [更新日志](CHANGELOG.md) · [安全策略](SECURITY.md)

当前版本：`0.1.44` · 内置运行时：`@deepseek-ai/dsh 0.1.1-rc.2`

## 为什么是积微

多数 AI 产品在一次会话结束后，也结束了用户的思考过程：资料散在聊天记录里，工具配置散在不同客户端，项目经验很难再次被调用。

积微关注的是一条可持续的个人认知链路：

```text
对话与资料 → Agent 行动 → 用户确认 → 知识沉淀 → 后续项目复用
```

它不是给聊天框叠更多按钮，而是让普通用户能低成本使用 Agent，也能看懂、校正和积累 Agent 带来的结果。

## 当前产品

| 本地启动与运行时隔离 | “我的大脑”知识闭环 |
| --- | --- |
| ![积微启动页](docs/screenshots/jiwei-startup.png) | ![积微我的大脑](docs/screenshots/jiwei-my-brain.png) |
| **文件、对话与项目工作台** | **Skills 与连接器扩展坞** |
| ![积微 Agent 工作台](docs/screenshots/jiwei-agent-workspace.png) | ![积微连接器中心](docs/screenshots/jiwei-connectors.png) |

截图由当前仓库的隔离本地构建生成，不包含真实账号、令牌或个人资料。工作台中的 DeepSeek Harness 界面属于所集成的官方运行时，并不表示积微是官方发行版。

## 核心能力

### 1. 文件是真正的附件，不是伪装成文本

- Finder 拖入、复制粘贴或选择文件后，输入框展示原生文件引用；不会把内部附件 ID、读取指令或全文塞进用户消息。
- Agent 需要内容时，再通过受限工具按页读取，避免一次性污染上下文。
- 当前支持 JSON、JSONC、YAML、Markdown、TXT、CSV、XML、DOCX、XLSX、PPTX；PNG、JPEG、WebP、GIF 走运行时的图片附件链。
- 敏感配置在进入 Host RPC 前脱敏；`.env`、密钥文件、压缩包、PDF、旧版 Office 和不可靠内容会拒绝或失败关闭。

### 2. 连接器是一条可诊断的握手链路

- 支持粘贴服务商 `mcpServers` JSON、本地选择 `mcp.json`，以及发现部分主流 Agent 客户端配置。
- 已识别的服务映射到相应提供方；未识别服务保留原名创建自定义连接器。
- 远程 MCP 只有在 `initialize` 与 `tools/list` 成功并返回工具后才标记为可用；HTTP 302 登录跳转不会被误判成连接成功。
- 配置、凭证、运行环境和 Harness 注册分阶段诊断。凭证在桌面主进程加密保存，不写入连接器记录、日志或导出 JSON。
- Agent 可以从附件直接发起“预览导入”，不再盲目搜索用户目录或反编译应用包。

真实账号授权仍取决于服务方协议、网络与权限。目录存在、配置结构有效或测试端点响应，都不等于所有账号已完成端到端验证。

### 3. “我的大脑”把经历变成可复用知识

- 对话中的决定、方法和复盘先进入知识收件箱，经用户编辑、确认后再沉淀。
- 待确认与已沉淀内容统一浏览，支持编辑、忽略、分类、标签与搜索。
- 支持手动粘贴、公开链接导入和微信公众号文章适配；通用 URL 导入包含 DNS、重定向、内容类型和体积边界。
- 微信文章静态抓取失败时，可使用只允许微信内容域名的隔离浏览器完成一次验证；不会降低通用 URL 的安全策略。
- AI 整理由用户主动触发，调用客户端已配置模型；原文和来源保留在本机，整理结果仍需用户确认。

### 4. 可观察、可恢复的 Agent 桌面

- 官方 Agent Loop、模型适配、权限与 Cordis 插件机制继续由 DeepSeek Harness 提供。
- 标准、自适应与增强编排可切换，模型健康、Token、上下文占用、缓存命中和执行轨迹可观察。
- 独立 `desktop` profile，不覆盖既有 DSH 配置；运行时默认仅监听回环地址。
- Windows x64、macOS Intel 与 Apple Silicon 独立打包，含日志脱敏、崩溃恢复、配置备份和更新回退。

## 架构边界

| 层 | 由谁维护 | 作用 |
| --- | --- | --- |
| 积微产品层 | 本项目 | 桌面壳、原生附件、连接器工作流、知识闭环、品牌与交互 |
| Harness 运行层 | DeepSeek 官方依赖 | Agent Loop、模型、权限、MCP 客户端、工作流与插件宿主 |
| 扩展兼容层 | 本项目与已署名第三方 | 任务、Git、SSH、移动端、界面扩展等可选能力 |

这种边界使积微可以跟随官方运行时升级，同时避免把社区能力冒充成官方能力。桌面应用 ID 暂时保持兼容，以便现有测试版用户无损升级；产品名、图标、安装包和公开说明均使用积微品牌。

## 安装

从 [Releases](https://github.com/jerry-yu95/deepseek-harness-desktop/releases/latest) 下载与你的系统匹配的安装包：

| 系统 | 安装包 |
| --- | --- |
| Windows 10/11 x64 | `JIWEI-Setup-<版本>-x64.exe` |
| Intel Mac | `JIWEI-<版本>-x64.dmg` |
| Apple 芯片 Mac | `JIWEI-<版本>-arm64.dmg` |

当前公开构建未使用商业代码签名证书，系统可能显示“未知发布者”。请仅从本仓库 Releases 下载，并使用同一 Release 中的 `SHA256SUMS.txt` 校验文件。详见[安装指南](docs/install.md)。

## 本地开发

需要 Node.js 22+ 与 pnpm 11：

```sh
git clone https://github.com/jerry-yu95/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm --filter @harness-design/desktop dev
```

构建 Apple Silicon 安装包：

```sh
pnpm --filter @harness-design/desktop pack:mac:arm64
pnpm --filter @harness-design/desktop pack:verify:mac:arm64
```

## 隐私与安全

- 默认本地优先，运行时只绑定回环地址；远程能力必须由用户显式开启。
- 文件本地路径不会进入会话正文；附件读取受类型、体积、分页与符号链接边界约束。
- 连接器密钥由系统安全存储能力加密；日志、导出和错误信息执行脱敏。
- 外部链接导入拒绝私网、混合 DNS、危险重定向和超限响应。
- 提交 Issue 前请移除令牌、Cookie、内部域名和完整用户路径。

安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 开源与署名

仓库使用 BSD-3-Clause 许可，详见 [LICENSE](LICENSE)。本项目包含来自早期 `dsh-web-ui` 集合及其他开源包的组件；这些代码的版权、许可证与来源必须保留，详见 [NOTICE.md](NOTICE.md) 和各包目录中的许可文件。

保留法定署名不代表积微沿用第三方品牌、宣传文案或截图，也不代表第三方为积微背书。

## 参与贡献

欢迎提交 Issue、测试记录、连接器适配与 Pull Request。请优先提供可复现步骤和脱敏后的诊断证据，并阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
