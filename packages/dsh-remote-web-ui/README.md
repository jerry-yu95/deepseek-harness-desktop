# DSH Remote Web UI

为 DeepSeek Harness 提供扫码配对、一次性令牌、设备会话与移动端界面的双端插件。

## 安全边界

官方 0.1.5-rc.2 将 `/api` 交给 Connection 的浏览器认证；旧 `api/gate`
事件不再提供权限钩子。本插件的手机端使用独立 `/m/api` 白名单，始终检查有效配对
及撤销状态，不把手机配对 Cookie 当作官方桌面认证。旧 `requirePairingForLan`
配置仅为读取旧 Profile 保留，已移除界面开关；关闭它不能放开任一路由。
会话内容通过官方 Session/Workspace Controller 读取，流式内容使用独立的
assistant-stream 通道，重连时从当前快照恢复，最终以持久化消息为准。

DeepSeek Harness 会主动把 Coding Agent 运行时限制在本机回环地址，避免把文件、
Shell 与远程代码执行能力暴露到网络。本插件遵守这条边界：

- 不向 `dsh web` 注入 `--host 0.0.0.0`；
- 不携带或启动 `cloudflared`；
- 不提供“一键局域网”或“一键公网”入口；
- 不把临时匿名隧道宣传成安全远程访问。

默认桌面版因此只能在当前电脑使用。企业设备需要手机访问时，请让组织 IT 部署
带身份鉴权、审计和访问控制的受控网关，再通过 `publicBaseUrl` 填写已经批准的
入口地址。本插件只消费该地址，不负责创建网络暴露。

## 能力

- 侧边栏移动端入口与配对状态面板；
- 一次性、限时且可撤销的配对令牌；
- 已配对设备 Cookie、在线状态与数量上限；
- 独立的 `/m` 移动端界面及受限方法集；
- 手机 `/m/api` 请求的配对校验与方法白名单；
- 可选的组织受控网关地址。

## 安装

```sh
dsh plugin --profile web add @linxin666/dsh-remote-web-ui
```

也可安装包含全部扩展与皮肤的聚合包：

```sh
dsh plugin --profile web add @linxin666/dsh-web-ui-all
```

## 开发与验证

```sh
pnpm install
pnpm --filter @linxin666/dsh-remote-web-ui typecheck
pnpm --filter @linxin666/dsh-remote-web-ui test
pnpm --filter @linxin666/dsh-remote-web-ui build
```

## 已知限制

- 官方 Harness 当前不支持将桌面 Coding Agent 安全地直接绑定到局域网；
- 配对状态存放在内存中，Harness 重启后需要重新配对；
- 不提供个人设备级撤销界面，只支持停止全部移动访问；
- `publicBaseUrl` 只有在外部受控网关已正确部署时才可用。

许可证：BSD-3-Clause。
