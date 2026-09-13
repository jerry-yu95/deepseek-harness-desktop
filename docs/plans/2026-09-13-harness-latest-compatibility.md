# Harness latest compatibility implementation plan

**Goal:** 在保留 JIWEI 现有改动和用户数据的前提下，适配官方最新公开 SDK 与桌面功能。

**Architecture:** 使用官方 NPM SDK 与现有 Cordis 插件/profile 机制，不修改官方源码或 node_modules。先在独立工作副本安装和验证，再逐文件校验基线并将通过的差异合回工作区。用户资料和真实会话不参与迁移测试。

**Tech Stack:** Electron、TypeScript/React、Cordis、pnpm、Vitest、Node test、Playwright。

## 目标版本与基线

- 2026-09-13 NPM 元数据：latest = 0.1.5-rc.1，next = 0.1.5-rc.2，alpha = 0.1.5-alpha.2。采用较新的官方公开预发布 0.1.5-rc.2，与此前核查的 GitHub Releases 一致，不采用 alpha。
- 当前分支 codex/jiwei-0.1.45-readiness，HEAD f4fd631270a288cff754aa92e04f9062450e1092；已有大量用户改动，完整源文件快照与升级副本在 /private/tmp/jiwei-harness-upgrade-wsgT5u/{baseline,work}。
- 快照不包含 .git、node_modules、DMG/dist、.env 或系统账号数据；原有文件仍在原工作区。

## Task 1：统一官方依赖

修改 apps/dsh-desktop/package.json、packages 内 SDK 依赖声明和 pnpm-lock.yaml，目标 SDK 为 0.1.5-rc.2。以实际 NPM 发布包及 peer 依赖为准处理被移除的包，避免旧新版核心服务混用。

验证：隔离目录 pnpm install --frozen-lockfile 能成功；检查运行时官方依赖闭包版本。

## Task 2：适配插件与桌面入口

先运行 pnpm typecheck、pnpm build，按实际新版声明修复接口。重点检查 shared/tsdown.client.ts、packages/dsh-web-ui-compat/src/client、扩展中心/任务看板/SSH 挂载、知识/统计/编排服务和桌面运行时 profile。

验证：全量类型、构建和受影响测试通过。保留现有能力，不将隐藏损坏插件作为兼容完成。

## Task 3：真实 Electron 回归

运行 apps/dsh-desktop/scripts/verify-knowledge-reading.mjs、verify-model-display.mjs、verify-composer-layout.mjs、verify-jiwei-acceptance.mjs，并按新版官方结构更新过期的测试定位。验证新附件上传和侧栏预览，不能只凭编译通过验收。

输出：隔离合成数据测试结果、无真实密钥的截图、失败修复记录。

## Task 4：会话格式与更新边界

核查官方 Session V3 迁移方式。用合成旧会话验证迁移、保留原日志、重启恢复和旧版拒读新版数据的边界；确保用户日常启动不会悄悄迁移真实资料。历史会话删除继续保留独立待办，不将 SDK 升级等同于完成删除。

## Task 5：合回并交付

逐文件对照 baseline，确认原工作区未被其他操作更新后合回差异，保留全部既有未提交内容。同步运行时版本说明和 QA 记录，复核 lockfile、构建与差异检查。无需另问每个实现步骤；不自动提交、发布、打包或执行真实账号迁移。

## 完成状态（2026-09-13）

| 任务 | 状态 | 验证依据 |
| --- | --- | --- |
| Task 1 | 完成 | 隔离及原工作区冻结安装通过；运行时 234 个官方 Harness 包全部为 0.1.5-rc.2 |
| Task 2 | 完成 | 原工作区全量类型检查、构建和 1,132 项包测试通过；没有隐藏损坏插件 |
| Task 3 | 完成 | 隔离 Electron 知识库 9 场景、整体流程 5 场景、模型配置、中英文发送区 30 状态、附件 3 场景通过；合回后附件 3 场景再次通过 |
| Task 4 | 完成 | 合成 v0/v1/v2 普通和 Zstandard 日志共 6 种组合通过，覆盖只读不改盘、写入 V3 保留旧文件、重启和拒读边界 |
| Task 5 | 完成 | 按基线哈希核对合回，无冲突；原工作区安装、构建、类型、测试、聚合配置与 diff 检查通过 |

Task 4 的边界明确为：本次没有启动真实用户 Profile 或迁移真实会话。官方读取旧会话时在内存转换；未来用户继续写入旧会话时会生成 V3 日志，不能解释为永久禁止迁移。

另有 20 项仓库脚本测试通过。完整结果与临时日志位置见 [验收记录](../qa/2026-09-13-harness-compatibility.md)。本次没有提交、发布或打包。
