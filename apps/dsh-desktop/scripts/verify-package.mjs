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
const unpackedModules = join(resources, 'app.asar.unpacked', 'node_modules')
const requiredPackages = [...new Set([
  ...DSH_BOOT_RUNTIME_PACKAGES,
  'pnpm',
  ...MANAGED_RUNTIME_PACKAGES,
  ...resolveRuntimePackages().keys(),
])].toSorted()

const nativePayloadPackages = [
  '@img/sharp-darwin-arm64',
  '@img/sharp-libvips-darwin-arm64',
  '@koromix/koffi-darwin-arm64',
]

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
await access(join(unpackedModules, 'cloudflared', 'bin', 'cloudflared'))
await access(join(resources, 'app.asar'))

// A package manifest is not enough for native modules: electron-builder can
// retain the JS wrapper while silently omitting the platform payload. Load the
// two native dependencies from the final app tree so that packaging fails
// before an installer is published.
const packagedRequire = createRequire(join(unpackedModules, '__native-verifier.cjs'))
const sharp = packagedRequire('sharp')
const koffi = packagedRequire('koffi')
const cloudflared = packagedRequire('cloudflared')
if (typeof sharp !== 'function') throw new Error('packaged sharp runtime did not load')
if (typeof koffi?.load !== 'function') throw new Error('packaged koffi runtime did not load')
await access(cloudflared.bin)

console.log(`verified ${requiredPackages.length} packaged runtime packages and native payloads in ${resources}`)
