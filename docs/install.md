# 安装积微 JIWEI

请只从 [`jerry-yu95/deepseek-harness-desktop` Releases](https://github.com/jerry-yu95/deepseek-harness-desktop/releases/latest) 下载。当前社区构建没有购买商业代码签名证书，因此系统可能提示“未知发布者”；这不等于安装包已损坏，但你应先核对校验值。

## 选择安装包

| 系统 | 文件 |
| --- | --- |
| Windows 10/11 x64 | `JIWEI-Setup-<版本>-x64.exe` |
| Intel Mac | `JIWEI-<版本>-x64.dmg` |
| Apple 芯片 Mac（M1/M2/M3/M4 等） | `JIWEI-<版本>-arm64.dmg` |

在 Mac 左上角苹果菜单选择“关于本机”，可以查看芯片类型。

## 核对 SHA-256

每个 Release 都包含 `SHA256SUMS.txt`。下载后在终端执行：

```sh
shasum -a 256 ~/Downloads/JIWEI-*.dmg
```

Windows PowerShell：

```powershell
Get-FileHash "$HOME\Downloads\JIWEI-Setup-*.exe" -Algorithm SHA256
```

输出应与同一 Release 中 `SHA256SUMS.txt` 对应文件完全一致。

## macOS 首次打开

1. 打开 DMG，把应用拖入“应用程序”。
2. 在 Finder 的“应用程序”中找到 JIWEI。
3. 按住 Control 点击应用，选择“打开”，再次确认“打开”。
4. 如果系统仍然阻止，前往“系统设置 → 隐私与安全性”，在安全提示旁选择“仍要打开”。

请优先使用系统提供的单应用放行流程，不要全局关闭 Gatekeeper。以后应用检测到新版时，会打开本项目 Release 页；下载新版 DMG 后覆盖“应用程序”中的旧版本即可，配置、API Key 和会话数据不会被安装包覆盖。

## Windows 首次打开

1. 运行下载的 EXE。
2. 如果 SmartScreen 出现保护提示，先确认文件来自本项目 Release 且 SHA-256 一致。
3. 点击“更多信息”，核对应用名称后选择“仍要运行”。
4. 推荐使用默认的当前用户安装目录。

Windows 版本可以在应用内完成后续更新；每次安装前仍会征求确认。

## 遇到问题

提交 Issue 时请附上系统版本、CPU 架构、应用版本和错误截图，但不要上传 API Key、访问令牌或完整用户目录。应用日志可以从菜单“帮助 → 打开日志目录”获取。
