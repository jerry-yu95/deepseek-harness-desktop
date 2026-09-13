# 2026-09-14 DMG 与源码同步验收

用户授权生成 DMG 并同步 GitHub。目标仓库为 `jerry-yu95/deepseek-harness-desktop`，公开网页已确认 Public；同步分支为 `codex/jiwei-0.1.45-readiness`。本轮不创建正式 Release 或发布标签，保持应用版本 `0.1.44`，使用日期与 Harness 标识区分本地包。源码对应本报告所属提交。

## 安装包

- 文件：`apps/dsh-desktop/dist/dmg-20260914-Tbfrgi/JIWEI-0.1.44-20260914-harness-rc2-arm64.dmg`
- 大小：207,454,771 bytes，约 198 MiB。
- SHA-256：`e24ac900de99d8303e120802586c38bc0445509390974e34d4ab5ef8d7ab1289`。
- 同目录 `SHA256SUMS.txt` 校验通过。
- Apple Silicon arm64，包含官方 Harness `0.1.5-rc.2`。本地 ad-hoc 签名，无 Developer ID 签名和 Apple 公证。

## 本轮打包修复

首次镜像依赖检查发现 electron-builder 没有收录官方 peer 链上的 `dsh-attachment`、`dsh-client-store` 和 `dsh-settings`。将三个同版本包明确加入桌面 production dependencies 与启动包清单，同步锁文件后重新打包。最终交付为上方 `Tbfrgi` 目录；第一次 `g2AsRZ` 目录仅保留失败诊断，不能交付。

CI 改为先构建完整工作区，再执行全量类型与测试；覆盖当前开发分支，并补充模型配置及官方附件 Electron 验证。pnpm 11 使用显式安装，避免脚本运行前隐式重装。公开文档检查改为生成器遍历，跳过依赖、Git 元数据、安装包和本地证据目录，修复旧产物数量过多时的调用栈溢出。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 镜像完整性 | `hdiutil verify` 通过 |
| 应用签名 | `codesign --verify --deep --strict` 通过 |
| 包内依赖 | 263 个运行包及 darwin-arm64 原生依赖通过 |
| 包内版本 | 262 个解析出的运行包与工作区版本一致，另检查 pnpm |
| 文件一致性 | 5 个关键桌面源码字节一致；应用入口、版本和依赖元数据一致；知识和扩展中心各 2 个入口/界面产物一致 |
| 修改后桌面测试 | 270/270 通过 |
| 仓库脚本测试 | 21/21 通过，含新增依赖目录排除场景 |
| 文档及差异 | public-surface audit、凭证文件/特征检查、Emoji 检查、CI YAML 静态检查、`git diff --check` 通过 |
| DMG 内知识库 | 9/9 场景通过，覆盖摘要重试、布局、图片离线读取、删除与恢复 |
| DMG 内通用流程 | 5/5 场景通过，含连接器保存修改重载；主动重启期间 78 次预期传输断开单独计数 |
| DMG 内官方附件 | 3/3 场景通过：原生粘贴、官方上传提交、工作区文件侧栏预览 |

三个 Electron 流程均直接运行只读挂载 DMG 内的 JIWEI，使用独立临时 Profile、合成文章、模型和 MCP 服务。没有覆盖现有安装，没有操作真实账号或迁移真实会话。验证完成后卸载本轮临时镜像。

最终目录内保留日志和 `evidence` 截图：`jiwei-knowledge-reading-l6WGmh`、`jiwei-acceptance-acdp8D`、`jiwei-official-attachments-FLJwYa`。离线图片截图已查看。二进制、日志和截图按现有忽略规则保留本地，不进入 Git 源码提交。

此前全量源码检查（1,132 项包测试、全量构建和类型检查）见 [Harness 兼容报告](2026-09-13-harness-compatibility.md)。本轮新增的 CI 配置已本地核对；本报告不将本机结果宣称为 GitHub hosted CI 通过。Windows、Intel 安装包以及真实模型与 IM 收发未在本轮验收。
