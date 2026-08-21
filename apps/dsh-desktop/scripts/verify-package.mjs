import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DSH_BOOT_RUNTIME_PACKAGES,
  MANAGED_RUNTIME_PACKAGES,
  packagePathSegments,
  resolveRuntimePackages,
} from '../src/profile.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const resources = resolve(process.argv[2] || join(appDir, 'dist', 'win-unpacked', 'resources'))
const targetPlatform = process.argv[3] || process.platform
const targetArch = process.argv[4] || process.arch
const unpackedModules = join(resources, 'app.asar.unpacked', 'node_modules')
const requiredPackages = [...new Set([
  ...DSH_BOOT_RUNTIME_PACKAGES,
  'pnpm',
  ...MANAGED_RUNTIME_PACKAGES,
  ...resolveRuntimePackages().keys(),
])].toSorted()

const nativePayloadPackages = targetPlatform === 'darwin'
  ? [
      `@img/sharp-darwin-${targetArch}`,
      `@img/sharp-libvips-darwin-${targetArch}`,
      `@koromix/koffi-darwin-${targetArch}`,
    ]
  : targetPlatform === 'win32'
    ? [
        `@img/sharp-win32-${targetArch}`,
        `@koromix/koffi-win32-${targetArch}`,
      ]
    : []

for (const packageName of requiredPackages) {
  const manifestPath = join(unpackedModules, ...packagePathSegments(packageName), 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.name !== packageName) throw new Error(`packaged manifest mismatch for ${packageName}`)
}

for (const packageName of nativePayloadPackages) {
  const manifestPath = join(unpackedModules, ...packagePathSegments(packageName), 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.name !== packageName) throw new Error(`packaged native manifest mismatch for ${packageName}`)
}

await access(join(unpackedModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
await access(join(unpackedModules, 'pnpm', 'bin', 'pnpm.mjs'))
const cloudflaredExecutable = targetPlatform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
await access(join(unpackedModules, 'cloudflared', 'bin', cloudflaredExecutable))
await access(join(resources, 'app.asar'))

// A package manifest is not enough for native modules: electron-builder can
// retain the JS wrapper while silently omitting the platform payload. Load the
// two native dependencies from the final app tree so that packaging fails
// before an installer is published.
const packagedRequire = createRequire(join(unpackedModules, '__native-verifier.cjs'))
const sharp = packagedRequire('sharp')
const koffi = packagedRequire('koffi')
if (typeof sharp !== 'function') throw new Error('packaged sharp runtime did not load')
if (typeof koffi?.load !== 'function') throw new Error('packaged koffi runtime did not load')

// Native modules can only be loaded when the verification host matches the
// package target. cloudflared is verified by its target-specific executable
// path above because requiring it would resolve against the host platform.
if (targetPlatform === process.platform && targetArch === process.arch) {
  const cloudflared = packagedRequire('cloudflared')
  await access(cloudflared.bin)
}

console.log(`verified ${requiredPackages.length} packaged runtime packages and ${targetPlatform}-${targetArch} native payloads in ${resources}`)
