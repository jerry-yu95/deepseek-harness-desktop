# Install DeepSeek Harness Desktop

Download only from the [`jerry-yu95/deepseek-harness-desktop` Releases](https://github.com/jerry-yu95/deepseek-harness-desktop/releases/latest). Community builds currently have no paid code-signing certificate, so the operating system may report an unknown publisher. Verify the checksum before allowing the application.

## Choose an artifact

| System | File |
| --- | --- |
| Windows 10/11 x64 | `Harness-Design-Desktop-Setup-<version>-x64.exe` |
| Intel Mac | `Harness-Design-Desktop-<version>-x64.dmg` |
| Apple silicon Mac (M1/M2/M3/M4 and later) | `Harness-Design-Desktop-<version>-arm64.dmg` |

On a Mac, choose Apple menu > About This Mac to identify the chip.

## Verify SHA-256

Every Release includes `SHA256SUMS.txt`. On macOS run:

```sh
shasum -a 256 ~/Downloads/Harness-Design-Desktop-*.dmg
```

In Windows PowerShell run:

```powershell
Get-FileHash "$HOME\Downloads\Harness-Design-Desktop-Setup-*.exe" -Algorithm SHA256
```

The result must exactly match the corresponding entry in `SHA256SUMS.txt` from the same Release.

## First launch on macOS

1. Open the DMG and drag the application into Applications.
2. Find Harness Design Desktop in Finder > Applications.
3. Control-click the application, choose Open, then confirm Open.
4. If macOS still blocks it, open System Settings > Privacy & Security and choose Open Anyway beside the security message.

Use the per-application system approval instead of disabling Gatekeeper globally. When the app detects a new version, it opens this project's Release page. Download the new DMG and replace the old application; configuration, API keys, and session data are stored separately and are not overwritten.

## First launch on Windows

1. Run the downloaded EXE.
2. If SmartScreen appears, first confirm that the file came from this project's Release and its SHA-256 matches.
3. Select More info, verify the application name, and choose Run anyway.
4. The default per-user installation location is recommended.

Windows can install later updates from inside the application, with confirmation before download and installation.

## Getting help

When opening an Issue, include the OS version, CPU architecture, application version, and an error screenshot. Do not upload API keys, access tokens, or a complete user directory. Logs are available from Help > Open Logs Folder.
