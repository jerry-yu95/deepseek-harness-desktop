# DeepSeek Harness Desktop 0.1.2 更新：修复目录选择报错，安装载荷减重，换上萌化图标

[quote="Fengs, post:6, topic:2753119, full:true, username:Fengs"]
出现过这个问题
[color=#ec1313][bgcolor=#ffffff]directory picker failed: directory picker failed: win32 folder dialog worker exited before reporting a result[/bgcolor][/color]
[/quote]

这个问题已经在 0.1.2 中修复。

根因是 Windows 原生目录对话框依赖的 COM worker 在返回选择结果前退出。新版没有简单重试这个不稳定链路，而是通过 DSH 官方 profile/patch 机制切换到官方内嵌目录浏览器，不修改 DSH 源码。现在支持目录浏览、手动编辑路径、新建文件夹和显示隐藏目录，也不会再启动出错的 Win32 worker。

这次也针对安装慢做了实际载荷优化：

- 安装文件数从 17,489 降到 13,173，减少 24.7%；
- 安装包从 190.84 MiB 降到 183.78 MiB；
- 精确裁剪 4,316 个不参与运行的声明文件、发布源码、测试示例、重复 pnpm 构建产物和非 x64 文件；
- 同一台 Windows 11 机器的参考完整解包测试，已发布的 0.1.1 为 93.00 秒，0.1.2 为 59.25 秒。单次结果会受杀毒软件和磁盘缓存影响。

所有实际功能都保留：原版 DSH Web UI、21 个 UI 插件、9 套皮肤、插件安装、技能发现与导入、SSH、终端、移动端远程、任务看板、Git 图、宠物和实时统计都仍在安装包内。

图标也换成了 DeepSeek 深海鲸鱼拟人娘化形象，桌面快捷方式、程序 EXE 和安装器使用同一套多分辨率图标，16 px 下仍能辨认轮廓。

验证情况：32 项测试全部通过，43 个关键运行包审计通过，打包版 pnpm 插件管理运行通过，并完成真实 EXE 的窗口启动和目录选择器交互测试。

项目地址：
https://github.com/jerry-yu95/deepseek-harness-desktop

Windows x64 0.1.2 下载：
https://github.com/jerry-yu95/deepseek-harness-desktop/releases/tag/desktop-v0.1.2

安装包 SHA-256：
`27045baffa89cf58cf3e103063faa61551c6b7aac860c07b543c3c5168392d71`

当前仍是社区未签名构建，Windows SmartScreen 可能显示“未知发布者”，请只从上面的 GitHub Release 下载并核对 SHA-256。
