# Knowledge Import and Composer Regression Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **For GPT-5.6 Luna xhigh:** 使用本机 `executing-plans` skill；上面的 superpowers 名称是计划模板名称，不要求安装插件。完整阅读本文，从 Task 0 开始。Task 12 后停止；不要自行打包、发布或进行真实账号验收。

**Goal:** 修复文章图片、摘要失败反馈、标签丢失、关闭与确认流程及对话输入栏错位，并以实际渲染回归验证。

**Architecture:** 保留现有知识存储、客户端模型注册与导入状态机，分别修复正文资源投影、模型结果处理和 UI 生命周期。原文、AI 摘要、用户笔记保持独立；所有异步操作有明确终态，失败不丢原文。图片采用受限资源管线，不直接执行外部 HTML。

**Tech Stack:** TypeScript、React、CSS Modules、Vitest/Testing Library、Electron、现有 Node/Electron E2E 脚本、DSH LLM runtime。

---

## 范围、现状与证据

工作目录为本仓库；当前分支 `codex/jiwei-0.1.45-readiness`。大量修改和新增文件尚未提交，是本轮工作的真实基线；禁止 reset、stash、覆盖、直接切回 HEAD。此次排查只读代码并新增本文，未实施修复，未重跑测试；旧测试通过不能代表当前报告的问题已解决。

| 问题 | 证据与判断 | 修复后的可见结果 |
| --- | --- | --- |
| 图片缺失 | 已确认 `core/article-text.ts` 只遍历文本，img 无子文本而被丢弃；`ArticleBlocks` 明确不渲染图片 | 正文顺序保留图片，加载失败有占位；原文仍可阅读 |
| AI 摘要失败 | 截图是失败状态而非一直加载。`refine.ts` 要求 finish.kind=stop，直接 JSON.parse 且严格校验；UI 将多种错误归为通用提示。尚不能确定真实模型失败原因 | 显示具体安全错误类别，可重试/换模型，生成成功后展示并持久化摘要 |
| 标签丢失 | 已确认 TagPicker 的查询输入与 selected 分离，只有回车/逗号/选项点击才提交；隐藏表单字段仅含 selected | 输入标签后直接点导入/保存/确认也能保留；中文输入法不误提交 |
| 输入框不等高 | TagPicker 外层有 padding/min-height，内层又受通用 input 样式影响；需浏览器量测确认最终级联 | 空标签或单行标签与标题同高，多标签自然增高 |
| 关闭无响应 | 已确认 readerBusy 时 close 直接 return；已有 detail 时一律开启离开提示而不直接关闭 | 无改动立即关闭；有改动明确询问；进行中可取消等待并关闭，不能静默忽略 |
| 确认不离开 | 已确认 Reader 只有 onChanged；父级未接确认成功事件，所以仅更新状态文字 | 成功提示、关闭弹窗、切换已沉淀并能看见该文章 |
| 对话工具栏错位 | 截图显示运行时左右组换行；尚未定位官方 composer 实际 DOM/样式 | 宽屏水平对齐，窄屏有意分层；发送/停止按钮始终可见 |

其他必须检查的风险：CaptureDialog 的 `[api]` effect 同时控制 mounted、模型列表和 cancel，api 引用变化可能取消操作或重置选择（待验证）；模型列表 Promise.all 中一个提供方失败可导致全部列表失败；模型目录错误被静默吞掉；原文 excerpt 被当作我的笔记初值；时间戳直接显示 ISO；旧 E2E 将“确认后仍留在弹窗”视为成功，必须纠正。

## 硬性约束

- 不访问真实凭证、不记录正文或 provider 原始异常；不将 Token、Cookie、内部地址写入代码、聊天、日志、截图。只使用合成文章、合成模型与测试目录。
- 不删除用户原文、历史标签、摘要或知识库。迁移向后兼容；历史已沉淀文章不得重新降为待确认。
- 不为支持图片关闭 SSRF 防护、CSP、沙箱或 HTML 清洗。不要把 node_modules 的临时修改作为交付。
- 不以增大超时、扩大 token 上限或放宽 JSON 校验冒充根因修复。
- 每个任务先写失败测试并确认失败原因，再实现，再运行测试。记录命令、结果、证据，不写“应该通过”。每项作为可审查改动单元；不自动提交现有混合改动。
- 本轮不打包、不上传、不推送、不做 TAPD/iWiki 真实账号验收。

## 产品交互契约

1. 导入 → 可见解析进度 → 原文预览；显式选择生成摘要时发送正文到所选已配置模型，显示生成状态 → 摘要预览 → 用户确认沉淀。
2. 摘要失败不阻止保存原文；不得用正文摘录冒充 AI 摘要。无可用模型应有加载/失败/确实无模型三种不同状态。
3. 确认成功只发生于服务端持久化成功之后：更新本地条目 → 关闭阅读器 → 切换 confirmed → 清理会隐藏目标文章的搜索/分类/标签过滤 → 提示一次成功。列表刷新失败不得误报确认失败或重复确认。
4. 关闭只读阅读器直接关闭；有未保存改动提供保存并关闭/放弃改动/继续编辑。生成中可取消并保留已保存文章；取消后晚到结果不改当前页面。
5. 标签支持历史选择、输入新标签、提交前冲刷输入缓冲；空标签归虚拟“其他”，不存 literal 其他。拖动沿用现有语义，测试多标签文章不意外丢标签。
6. 文章原文、生成摘要、用户笔记不互相覆盖。旧笔记即使复制了正文也不能静默清空；新导入笔记默认空。

## Task 0：检查基线与执行记录

**Files:** 阅读前一轮 `docs/plans/2026-09-07-knowledge-import-reading-{requirements,plan,progress}.md`；新增 `docs/plans/2026-09-08-knowledge-regression-progress.md`。

1. 执行 `git status --short`、`git diff --stat`，记录当前 HEAD、已有改动范围，不输出私密配置。
2. 阅读本文涉及源码及本地包 scripts，确认包名和测试入口；不要假设旧测试数仍正确。
3. 运行基线：`pnpm --filter @harness-design/dsh-knowledge test`；`pnpm --filter @linxin666/dsh-client-ui-extension-center test`；`pnpm --filter @harness-design/desktop test`。
4. 记录预存失败与环境阻塞。未能运行的测试明确标注；不得绕过失败推进交付结论。

## Task 1：先补用户失败路径测试

**Files:** `packages/dsh-extension-center/tests/knowledge-import-flow.test.tsx`、`tests/knowledge-tags.test.tsx`、`tests/knowledge-tab.test.tsx`。

1. 加例：输入未按 Enter 的标签，点击保存，断言 create/importUrl tags 含该值；中文 composition Enter 不提交。
2. 加例：确认成功后 dialog 不存在、confirmed tab 选中、notify 仅一次；确认失败仍留 dialog。
3. 加例：无改动 Close 立即消失；有改动提供明确选择；生成中取消后晚到 Promise 不更新 UI。
4. 运行 `pnpm --filter @linxin666/dsh-client-ui-extension-center test -- tests/knowledge-import-flow.test.tsx tests/knowledge-tags.test.tsx tests/knowledge-tab.test.tsx`，确认新例对当前缺陷失败。保留旧例，但修改与新交互契约矛盾的断言。

## Task 2：标签缓冲与表单提交一致性

**Files:** `src/client/panel/KnowledgeTagPicker.tsx`、`KnowledgeCaptureDialog.tsx`、`KnowledgeArticleReader.tsx`（均位于 extension-center）；对应 Task 1 测试。

1. 抽取统一纯函数合并 selected 和 pending 输入：trim、去重、逗号分隔、限制8个/每个32字符，超限显示错误，不静默截断。
2. 采用可由父表单同步取到 pending 的受控值或显式提交接口；不要只依赖 onBlur 后异步 setState，避免同一次点击读取旧 FormData。
3. 处理回车、失焦、点击建议、直接提交、IME composition；非法标签不发送请求。
4. 验证导入 → detail → 编辑 → confirm → 重新打开标签完整保留。运行标签和导入测试。

## Task 3：确认成功的完整事务交互

**Files:** `KnowledgeArticleReader.tsx`、`KnowledgeCaptureDialog.tsx`、`KnowledgeTab.tsx`、`src/client/article-locales.ts`。

1. 增加独立 `onConfirmed(item)` 事件，由 Reader 在确认 API 成功后发出，通过 Capture 传给 Tab；与普通 onChanged 分开。
2. 保存用户草稿成功后才调用 confirm；失败不关闭，防重复点击。
3. Tab 合并返回条目，设置 view=confirmed，清理冲突过滤，关闭 capture/reading，notify 一次；后台刷新失败另给轻提示。
4. 新测试覆盖编辑保存失败、confirm 失败、confirm 成功但 list 失败、重复点击、已沉淀文章再打开。

## Task 4：关闭、异步取消和模型选择生命周期

**Files:** `KnowledgeCaptureDialog.tsx`、`KnowledgeArticleReader.tsx`、`knowledge-import-state.ts`、`packages/dsh-knowledge/src/client/api.ts`。

1. 分离挂载/焦点恢复、模型目录加载、初始 detail 加载，确认父级 api 是否稳定；新增父 rerender 测试证明不误 cancel、不重置手选模型。
2. Reader 显式报告 dirty；Close 不再直接 return。未修改直接关闭；修改中明确提示；生成/保存中必须有忙碌提示及可理解的取消路径。
3. 为可取消请求传 signal，写入请求取消不代表服务器必然回滚；重新打开应读取持久状态，不能承诺已撤销保存。
4. 清理晚到响应、卸载更新、readerBusy finally；验证 Escape、焦点陷阱、焦点返回触发按钮。

## Task 5：定位摘要真实失败类别（禁止先猜修复）

**Files:** `packages/dsh-knowledge/src/core/refine.ts`、`core/model-route.ts`、`src/index.ts`、`src/client/api.ts`、`tests/refine.test.ts`、`tests/model-route.test.ts`、`tests/plugin.test.ts`。

1. 完整追踪 modelRoutes → resolve → ctx.llm.stream → BlockAssembler → validate → store → client reducer。阅读当前安装的 DSH LLM 类型/实现，确认 finish 和事件契约。
2. 构造不同输出流：标准 JSON、围栏 JSON、reasoning+text、空 text、length、error、aborted、超时、非法 schema。只保存合成数据。
3. 记录阶段和安全错误码，不记录供应商原始响应。测试一个 provider listModels 失败是否使全部路由消失。
4. 在 progress 写明复现到的具体缺陷；若真实失败无法在合成提供方复现，明确保留真实验证项，不声称已解决用户所选模型。

## Task 6：摘要兼容性与安全错误反馈

**Files:** Task 5 文件、`KnowledgeCaptureDialog.tsx`、`src/client/article-locales.ts`。

1. 根据 Task 5 证据修复。允许去除一个完整 JSON Markdown 围栏再严格 JSON.parse；禁止任意正则截取括号或接受错误 schema。
2. 保留字段、长度、标签、敏感内容校验。按 SDK 语义区分模型拒绝/输出无效/截断/超时/路由不可用/通用失败；不泄露原始错误。
3. 如参数与模型能力冲突，按已注册能力选择参数，不硬编码用户模型名；reasoning/token 上限变化必须有测试证据。
4. 模型目录局部失败保留健康提供方；列表失败不可伪装“暂无模型”。保留用户当前合法选择。
5. 摘要生成显示可见进度/耗时/取消，成功跳到摘要页并持久化；失败可重试和换模型，原文不变。
6. 运行 knowledge 与 extension 全部测试。明确 fake stream 测试不等于真实模型验收。

## Task 7：受限图片数据模型与提取

**Files:** `packages/dsh-knowledge/src/core/article-text.ts`、`core/types.ts`、`core/store.ts`、`core/validate.ts`、`core/url-import.ts`、`apps/dsh-desktop/src/knowledge-browser-import.mjs`；新增 `packages/dsh-knowledge/tests/article-images.test.ts`。

1. 先确定兼容格式：保留现有 body，并添加带位置/资源 ID/alt 的受限图片元数据或结构化块；历史纯文本仍可读。不可把任意图片 URL 拼入正文后直接执行。
2. 测试公众号 img 的 data-src/src、顺序、重复、空值、相对 URL、懒加载；统一浏览器与 HTTP 导入语义。自包含的 articleText 浏览器序列化不能引用不可用闭包。
3. 每篇建议最多50图、单图5MiB、总量20MiB；达到限制给部分导入说明，不删除已提取正文。元数据及 URL 不送到摘要模型，摘要只发文本。
4. 保存原子性、历史兼容、删除关联资源与失败清理均写测试；具体预算作为本轮默认值在 progress 记录。

## Task 8：安全图片加载与阅读显示

**Files:** 新增 `packages/dsh-knowledge/src/core/article-images.ts`（受限资源策略）；既有导入/store/API/wire 按实际 transport 接入；`KnowledgeArticleReader.tsx`、`panel.module.css`；desktop browser import 测试。

1. 优先在导入时通过现有受控网络通道缓存允许的公开图片，返回非路径型资源 ID；不要让 renderer 任意请求源站或打开本地文件。
2. 每次重定向/DNS 解析校验公网地址，拒绝 loopback/private/link-local、凭证 URL、非 HTTP(S)、SVG/HTML 和 MIME 欺骗；限制字节/超时，避免仅校验初始 URL 的 SSRF。
3. 若现有 transport 不支持安全二进制传输，先实现受限资源端点/IPC 并测试，不以 unrestricted data/blob/remote URL 放行 CSP。无 cookie、无 Referer 泄漏，不抓取受限内容。
4. 阅读器显示响应式 figure、alt、加载占位、失败占位；断网重新打开缓存图片可读。图片失败不让整个导入失败。
5. 验证恶意 HTML 不执行、外链不自动加载、资源 ID 不能越权读任意文件；补 Electron 渲染证据。

## Task 9：阅读器布局和内容语义

**Files:** `KnowledgeArticleReader.tsx`、`KnowledgeCaptureDialog.tsx`、`panel.module.css`、`article-locales.ts`。

1. 单行标题/tag 外框统一40px、border-box；tag 内层去除重复 min-height/padding；多标签可增高，勿固定高度裁切。
2. 头部、工具栏、底部按钮固定在 dialog 内，正文单一主要滚动容器；错误提示不挤出关闭与确认按钮。
3. 阅读器标题改为文章阅读语义；时间本地化；摘要先渲染可读 Markdown，编辑作为显式动作。
4. 新文章笔记默认空，保留历史笔记；切 tab 不丢草稿。检查标签建议、长标题、空状态、错误状态、按钮 loading。
5. 以1024×768、1280×800、1440×900和125%缩放截图验收；不使用真实文章/账号截图。

## Task 10：对话输入栏运行态错位

**Files:** 先定位实际 DSH composer 的源码/依赖和本项目样式注入所有者，再在进度文件写精确路径；新建 `apps/dsh-desktop/scripts/verify-composer-layout.mjs`，在 `apps/dsh-desktop/package.json` 注册脚本。

1. 不存在 `packages/dsh-ui/src`，不可按猜测路径开工。用 rg 查依赖实际安装位置和宿主 slots，读取运行态/空态 DOM、computed styles、bounding boxes。
2. 合成对话分别复现空态、提交后、流式中、停止后、长模型名、中英文、窄窗，确认是哪组宽度/换行/额外 spinner 引起。
3. 宽屏左右组居中同一行；模型名可截断，停止按钮不可被挤出。窄屏允许设计好的两行，不强制全局 nowrap 造成溢出。
4. 修改本项目受控样式/扩展或可复现依赖 patch；不得仅改 node_modules 或全局 button/flex 类。
5. E2E 测量同排中心纵坐标误差≤2 CSS px、控件不出界、输入与停止可用；窄屏按明确两行契约断言。

## Task 11：端到端回归，不只跑组件测试

**Files:** `apps/dsh-desktop/scripts/verify-knowledge-reading.mjs`、Task 10 脚本、必要合成 fixtures。

1. 更新旧测试“确认后仍停留在 modal”的错误预期，覆盖导入标签未 Enter、图片加载、摘要成功与失败重试、编辑保存、关闭、确认后跳转。
2. 在真实 Electron renderer 验证高度、滚动、按钮可点击、焦点、弹窗不遮挡；不能以 dispatchEvent 或自造 DOM 代替全部实际交互。
3. 运行 `pnpm --filter @harness-design/desktop test:knowledge:e2e` 和新增 composer 脚本；使用临时 profile 和合成模型。
4. 每种关键状态留截图并实际打开查看。截图没看过不得写“视觉通过”；修复后重跑失败场景。

## Task 12：全量验证与交接停止点

1. 运行三个包全量 test（Task 0 命令），两个 TS 包各自 typecheck 与 build：`pnpm --filter @harness-design/dsh-knowledge typecheck` / `build`；`pnpm --filter @linxin666/dsh-client-ui-extension-center typecheck` / `build`。
2. 重跑 knowledge E2E、composer E2E、`pnpm --filter @harness-design/desktop test:acceptance`。构建依赖若有额外要求按现有 scripts 执行并记录。
3. `git diff --check`；检查新增依赖、资源、安全边界、生成产物是否与源码一致。只记录脱敏结果。
4. progress 为每项填写完成/未完成、测试命令结果、截图路径、剩余风险；尤其真实 provider 与公众号网络环境尚未验证必须明说。
5. 停止并汇报：已修问题、未证实问题、用户需验收清单。不得自动打包。用户确认后再单独执行 DMG 构建、`pack:verify:mac:arm64`、隔离 profile 启动与安装验收；生成 DMG 不等于验收成功。

## 执行交接提示词

完整阅读 `docs/plans/2026-09-08-knowledge-regression-repair.md`，使用 executing-plans skill，从 Task 0 开始执行；先检查已有改动与历史测试，逐项先写失败测试再修复，保留所有未提交改动。摘要与 composer 未确认根因的项目必须先复现，不得猜测修复成功。禁止读取或泄露真实凭证、Cookie、Token、内部地址及正文日志。Task 12 完成后停止汇报，打包、发布和真实账号验收等用户另行确认。
