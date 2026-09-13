# 2026-09-13 公众号阅读与摘要排版验收

环境：macOS arm64，Node 22.22.3、pnpm 11.21.0、Electron 43.4.0。分支 `codex/jiwei-0.1.45-readiness`，HEAD `f4fd631` 加保留的未提交修改；该 SHA 本身不包含本轮修复。源码版本仍为 0.1.44，无提交、发布或新安装包。

## 修改与诊断

- 图片获取与摘要模型是独立链路。文本模型不会使已提取的图片链接无法下载或显示；本轮没有验证模型的视觉理解能力。
- 本机对固定公众号图片 CDN 的只读 DNS 检查返回了代理 Fake-IP 范围。既有通用图片下载器会拒绝这类地址，而且使用 Node 直连。这是可核对的本机兼容性问题，不能直接证明用户那篇文章的唯一失败原因。
- 固定三个 HTTPS CDN 主机改用 Chromium 网络栈及系统代理；通用图片仍保持公开 IP 校验和固定连接地址。每次重定向检查完整 URL、主机、协议、端口和凭证，最多三次；单图 5 MiB、总量 20 MiB、单次 8 秒及整批预算保持受限。图片 MIME 与签名仍在入库前验证。未引入账号或 Cookie 获取。
- 错误仅保存允许的访问、格式、大小、超时、网络、缓存、未知分类；原始网络错误、图片源 URL 和正文日志不进入诊断元数据。历史失败图片没有保存源 URL，需要重新导入文章才能再次下载。
- 新摘要请求总述、分组标题和要点，由宿主格式化为有界文本；兼容旧文本响应。阅读器安全呈现标题、列表、引用和强调，不执行 HTML，也不加载 Markdown 远程图片。旧摘要只做显示分段，保留原文及人工编辑。
- 阅读型排版统一标题、署名、摘要和正文的列宽；编辑框全宽、独立提示和字数提示；卡片仅预览总述，底部标签/移动菜单/操作居中对齐。窄工作区的标题、筛选和操作自动换行，切换阅读标签时回到顶部。

## 失败证据与纠正

- 旧编辑框实际 Electron 测量为宽 162、高 198、面板宽 898；新增编辑区几何断言失败。RED 证据标识：`jiwei-knowledge-reading-uQOvGv`。
- 旧摘要生成器不接受结构化字段，旧文本块渲染器会把无空行分隔的标题及列表合并；新增测试均先失败，再修复通过。
- 初版浏览器 `session.fetch` 在 Electron 43 的手动重定向实测中报 `Redirect was cancelled`。最终改为 `net.request` 的同步重定向事件处理。没有以模拟请求通过替代实际网络验证。
- 卡片布局调整后，拖拽脚本默认中心点落在来源链接上，未触发卡片移动。脚本改从卡片边缘拖动，实际确认、标签移动与刷新验证恢复通过。

## 当前验证

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| 知识包 | `pnpm --filter @harness-design/dsh-knowledge test` | 88/88 |
| 扩展中心 | `pnpm --filter @linxin666/dsh-client-ui-extension-center test` | 95/95 |
| 桌面 | 桌面目录 `node --test --test-reporter=spec test/*.test.mjs` | 256/256 |
| 类型/构建 | 两包分别执行 `typecheck` 与 `build` | 通过，保留既有构建警告 |
| 实际阅读界面 | `pnpm --filter @harness-design/desktop test:knowledge:e2e` | 7/7；新增结构、编辑宽度、底部中心线、窄屏、滚动复位断言 |
| 实际图片网络 | `pnpm --filter @harness-design/desktop test:wechat-images:e2e` | 2 项通过：代理及匿名下载；禁止的重定向不被请求 |
| 通用 Electron 验收 | `pnpm --filter @harness-design/desktop test:acceptance` | 5/5；主动重载的 17 次预期断连单独计数 |
| 补丁空白检查 | `git diff --check` | 通过 |

图片网络脚本使用临时自签证书、本地 TLS 服务、本地 CONNECT 代理和专用内存会话。测试专用证书校验仅允许固定测试主机与准确的临时证书；生产下载没有更改 TLS 证书校验。实际请求验证了不发送会话 Cookie、不接受响应 Cookie、不发送 Referer，并在跳向不允许的目标前终止。测试依赖本机 OpenSSL，结束后清理证书和临时配置。单元测试另覆盖地址伪装、重定向循环、无效图片、流式超限、超时、取消和错误脱敏。

最终阅读证据：`jiwei-knowledge-reading-65IzBx`，包括 `knowledge-summary.png`、`knowledge-summary-editor.png`、`knowledge-cards.png`、`knowledge-cards-narrow.png`、窄屏/缩放编辑截图及 `result.json`。通用验收：`jiwei-acceptance-qP4xKn`。均为工具输出的临时证据目录，使用合成正文与模型，无真实文章或账号；已打开检查摘要、编辑器及宽窄卡片截图。

## 剩余边界

用户测试的公开文章链接尚未提供，因此尚未验证该文章图片实际是否可匿名下载，也没有调用真实摘要模型。新摘要结构在重新生成时生效。2026-09-12 的 DMG 不包含本轮修改；本轮结果来自源码运行，不是新安装包验收。Composer 双语回归保留 2026-09-12 的历史结果，本轮 CSS 均限定在知识界面，没有重跑 Composer、全 monorepo 或 hosted CI。

## 随后授权的 DMG 验证

用户随后明确要求打包用于验证。新文件为 `apps/dsh-desktop/dist/dmg-20260913-ewrmFO/JIWEI-0.1.44-20260913-arm64.dmg`，包含上述修复；镜像完整性、ad-hoc 签名、218 个运行依赖、十份关键文件一致性以及镜像内知识阅读 7/7、通用验收 5/5 通过。安装包、校验和及证据记录见 [发布验收报告](0.1.45-release-report.md)。前面的源码验收记录保持为该阶段快照；新包不代表真实公众号或模型已通过验证。
