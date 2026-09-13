# 2026-09-12 工作区审阅地图

基于 `codex/jiwei-0.1.45-readiness`、HEAD `f4fd631` 的未提交工作区。该提交号只定位起点，不能重建全部当前改动。现有修改和未跟踪文件全部保留，没有拆提交、重置或删除旧产物。

以下分组用于审阅顺序，存在共享文件和构建依赖，不代表可独立 cherry-pick 的提交。

| 顺序 | 审阅单元 | 主要文件 / 范围 | 关注点与证据 |
| --- | --- | --- | --- |
| 1 | 知识核心与存储 | `packages/dsh-knowledge/src/core/`、`src/index.ts`、`src/wire.ts`、`src/client/api.ts`、对应 tests | 原文/图片资源边界、取消与原子写入、模型结果/错误分类、标签；先运行知识包测试和构建 |
| 2 | 桌面导入链路 | `apps/dsh-desktop/src/knowledge-browser-import.mjs`、`knowledge-import-ipc.mjs`、`preload.cjs`、对应 test | 浏览器提取、图片位置、取消/迟到结果；依赖知识包生成导出 |
| 3 | 知识阅读与沉淀 UI | `packages/dsh-extension-center/src/client/panel/Knowledge*.tsx`、`knowledge-import-state.ts`、`article-locales.ts`、相关 tests | 未确认标签、关闭/保存/确认事务、摘要重试、阅读布局；知识 Electron 七场景 |
| 4 | Composer | `apps/dsh-desktop/src/composer-layout.mjs`、`window-chrome.mjs`、`scripts/verify-composer-layout.mjs`、模型 fixture | 仅桌面范围样式，依赖官方 SDK DOM；双语各 15 状态的实际尺寸断言 |
| 5 | 先前连接器工作 | `apps/dsh-desktop/src/extensions/`、`extension-ipc.mjs`、`log-store.mjs`、连接器 UI/IPC/测试 | 配置编辑、MCP 握手、OAuth 和脱敏；保留既有授权限制，发现工具不等于业务调用成功 |
| 6 | 共享入口与生成物 | `electron-app.mjs`、`bridge.ts`、`locales.ts`、`panel.module.css`、包清单、`pnpm-lock.yaml`、两包 `lib/` | 这些文件横跨多个分组；审阅源码后再检查生成导出和锁文件，不按文件机械拆分 |
| 7 | 本轮工程收口 | `.github/workflows/desktop-ci.yml`、`scripts/e2e-artifacts.mjs`、三个验收脚本、辅助测试、README/CONTRIBUTING/QA 文档 | 构建先于消费方测试；三平台单元门禁、macOS arm64 Electron 门禁、失败留证、当前状态入口 |

## 生成物与范围

知识包当前生成入口引用 `store-Q7PB7jnu.js` 和 `cancellation-jXG1hdt8.js`。既有未引用的旧 store chunks 保留；它们的清理、提交边界和打包包含规则应在发布准备时单独核对，不能把整个 `lib/` 目录当成一份已经审阅的源码变更。

未修改官方 SDK 或 `node_modules`，未调整版本、发布触发器或实际账号配置。源码版本仍为 `0.1.44`，目标 `0.1.45` 未交付。

## 验证入口与后续边界

- 当前结果以 [发布验收报告](0.1.45-release-report.md) 为准；[验收矩阵](0.1.45-acceptance-matrix.md) 保留分层及历史证据。
- 之前 Task 0–12 的实现和 RED/GREEN 过程见 [知识回归进度](../plans/2026-09-08-knowledge-regression-progress.md)。本轮步骤见 [工程收口计划](../plans/2026-09-12-engineering-stabilization.md)。
- 按 [贡献指南](../../CONTRIBUTING.md) 重跑本地门禁。截图/geometry/result 使用合成数据，存于每次命令输出的独立临时目录；CI 上传保留七天，不是永久发布档案。
- 尚需提交后实际运行 hosted CI、覆盖更大 monorepo 范围、三平台安装包验收和真实模型/TAPD/iWiki/微信网络验收。当前完成的源码验证不能替代这些结果。
- OAuth 当前依赖动态客户端注册；自动刷新、预注册客户端及专有 SSO 不在已验证能力内。详见 [连接器记录](../plans/2026-09-07-connector-repair-progress.md)。
