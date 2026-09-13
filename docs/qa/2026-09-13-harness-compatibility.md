# JIWEI 官方 Harness 0.1.5 兼容验证

日期：2026-09-13。范围：源码兼容升级；没有提交、发布或打包，没有启动真实用户 Profile。

## 版本与实现

- 原内置 SDK：0.1.1-rc.2；目标：官方公开 next 版本 0.1.5-rc.2。核查时 latest 为 0.1.5-rc.1，alpha 为 0.1.5-alpha.2。本次选择较新的 RC，不使用 alpha。
- [官方项目](https://github.com/deepseek-ai/deepseek-harness)；[NPM 包](https://www.npmjs.com/package/@deepseek-ai/dsh)。
- 全部适配基于官方发布包、Cordis 注入、Profile 与插件机制；没有修改官方源码或 node_modules。
- 移除已停用的 client-runtime / host-apiproxy 依赖，改用 Client Store、Session/Workspace Controller、Settings 服务与官方浏览器模块表。
- 新增本机 RPC 适配器：保留知识库、文本附件和编排接口的回环限制，并使用官方浏览器认证；检查 Socket、Host、Origin、请求类型和体积，错误响应不带内部详情。
- 桌面启动适配官方 token 换取 HttpOnly Cookie 的流程。状态、IPC 返回与日志不携带启动 token；健康检查必须通过认证，不能把 401 当作就绪。
- 新版保留 `desktop` Profile 名称，JIWEI 改用 `jiwei`。首次读取旧 desktop 扩展清单作为初始配置，保留旧目录。
- Session V3 的 system/message、startSeq/endSeq、嵌入式 Assistant stream 已进入摘要相关服务、统计回放、上下文基准和任务流程；同一步重试不会重复累计输出估算。
- 移动端使用官方域服务，独立传输生成中内容和持久消息；重连恢复部分输出，避免重复文字；后台任务单独订阅完成事件，不依赖当前打开的会话窗口。
- 远程端旧 api/gate 已不再注册。官方 /api 使用浏览器认证，手机 /m/api 始终检查配对和撤销；旧 requirePairingForLan 字段仅用于兼容旧配置，移除失效开关。
- 适配官方富文本输入框，保留 JIWEI 原生文件引用及发送区布局。官方上传附件在消息中展示文件卡片；工作区文件使用右侧预览。官方附件卡片本身不提供点击阅读交互。

## 已完成的隔离验证

所有模型、文章、文件、MCP 连接器和凭证均为合成夹具。没有真实模型请求或 IM 消息。

| 检查 | 结果 |
| --- | --- |
| 冻结锁文件安装 | 通过；`frozen-install.log` |
| 全量类型和构建 | 通过；最后变更另有定向构建 |
| 全量包测试 | 通过；后续协议补测和迁移矩阵另列 |
| 仓库脚本测试 | 20 项通过 |
| 聚合包配置一致性 | 通过 |
| 新 RPC 认证与信任边界 | 4 项通过；另有实际 Host 接口验证 |
| 手机协议与界面 | 100 项通过，含重连、重复块、完成消息替换和权限路由 |
| 后台任务 | 98 项通过，含未打开会话的失败结算 |
| 旧会话 v0/v1/v2 × 普通/Zstandard | 6 种组合通过 |
| Electron 知识库 | 9 场景通过 |
| Electron 整体流程 | 5 场景通过，含连接器保存重载 |
| Electron 模型配置 | 默认地址、保存/草稿 Key 显隐通过 |
| Electron 发送区 | 中文 15 状态、英文 15 状态通过 |
| Electron 附件及文件预览 | 原生粘贴、官方上传提交、工作区侧栏预览通过 |

隔离源基线和日志：`/private/tmp/jiwei-harness-upgrade-wsgT5u/`。

本轮实机截图目录（均为合成数据）：

- 知识库：`/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-knowledge-reading-9X1U7v`
- 模型：`/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-model-display-ZWSsrX`
- 中文发送区：`/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-composer-zh-522rBK`
- 英文发送区：`/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-composer-en-yfl4UV`
- 整体流程：`/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-acceptance-BFvDis`
- 附件/文件预览：`/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-official-attachments-QvQK1H`

## 数据与回退边界

官方读取旧会话时只在内存转换；取得写入句柄继续会话时发布独立 V3 文件，旧代文件逐字节保留。
测试验证重启读取一致、旧 V2 codec 拒读 V3，以及出现未知更高版本时拒绝读取而非回退到旧文件。
旧 JIWEI 使用的是 v0，已纳入普通和压缩日志测试。

这不是承诺旧安装包能读取升级后新增的会话。真实账号验收或新安装包首次使用前应保留完整用户数据备份；
不要通过删除新版日志强迫回退，否则会丢失升级后继续写入的内容。本次没有触碰用户的真实会话数据。

IM 保留既有 0.13.0 插件，确认完整插件树能启动；没有验证真实平台账号收发。Windows/macOS x64
打包与安装签名不属于本次源码验收。官方 UI primitives 和 LLM 发布包缺少部分 sourcemap 会造成测试工具提示，
不影响测试结果。另有构建工具的 Squirrel/TypeScript peer 提示，未通过改动官方依赖源消除。

## 合回状态

隔离变更已按 baseline 哈希逐文件核对合回，无冲突，保留原有全部未提交内容。原工作区重新安装并构建，未复用隔离目录的构建产物作为原工作区验收依据。

| 原工作区检查 | 结果 | 日志（位于上述升级临时目录） |
| --- | --- | --- |
| `CI=true pnpm install --ignore-scripts --frozen-lockfile` | 通过 | `original-install.log` |
| `pnpm -r --no-bail typecheck` | 通过 | `original-typecheck.log` |
| `pnpm -r --no-bail build` | 通过 | `original-build.log` |
| `pnpm -r --no-bail test` | 1,132 项通过；其中桌面 270、手机 100、后台任务 98 | `original-tests.log` |
| `node --test scripts/*.test.mjs` | 20 项通过 | `original-script-tests.log` |
| `node scripts/aggregate.mjs --check` | 通过 | 终端输出 |
| `git diff --check` | 通过 | 终端输出 |
| `resolveRuntimePackages()` | 262 个运行时包；其中 234 个官方 Harness 包全部为 0.1.5-rc.2，包含本机 RPC 适配器 | 终端输出 |
| `node apps/dsh-desktop/scripts/verify-official-attachments.mjs` | 原生文件粘贴、官方上传后消息附件、工作区侧栏预览 3 场景通过，无 pageerror | `original-attachments-e2e.log` |

上述 pnpm 构建、类型及测试命令设置 `pnpm_config_verify_deps_before_run=ignore`，避免 pnpm 11 在已完成冻结安装后再次隐式安装。全量包测试包含实际官方 Host 启动、认证握手及本机上传接口验证。

合回后 Electron 证据：`/var/folders/zy/5rbrrsgd5dbdt15t5p0bl50r0000gp/T/jiwei-official-attachments-u4FnqS`，其中 `final.png` 已人工查看，确认文件预览正文可见。临时日志和截图不作为永久归档，主要结论保留在本文。

执行方式沿用 Code / executing-plans 技能的分步实现与验证流程；因工作区已有大量未提交改动，先隔离验证、逐文件哈希合回，再完成原工作区复验。没有修改产品定位或扩大到其他项目。
