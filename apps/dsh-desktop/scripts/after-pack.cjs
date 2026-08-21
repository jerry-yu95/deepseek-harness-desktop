const { readdir, rm, stat, writeFile } = require('node:fs/promises')
const { join, relative } = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)

const SOURCE_ROOTS = new Map([
  ['@anthropic-ai/sdk', ['src']],
  ['@mistralai/mistralai', ['packages', 'src']],
  ['@xterm/xterm', ['src']],
  ['ajv', ['lib']],
  ['openai', ['src']],
  ['zod', ['src']],
])

const DEVELOPMENT_DIRECTORIES = new Set([
  '__tests__',
  'coverage',
  'example',
  'examples',
  'test',
  'tests',
])

function splitPackagePath(relativePath) {
  const parts = relativePath.split(/[\\/]/u)
  if (parts[0]?.startsWith('@')) {
    return { packageName: `${parts[0]}/${parts[1]}`, packageParts: parts.slice(2) }
  }
  return { packageName: parts[0], packageParts: parts.slice(1) }
}

function classifyPrunableFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/')
  const { packageName, packageParts } = splitPackagePath(normalized)
  const fileName = packageParts.at(-1) ?? ''

  if (/\.d\.(?:ts|mts|cts)$/u.test(fileName)) return 'type-declaration'
  if (packageParts.some((part) => DEVELOPMENT_DIRECTORIES.has(part))) return 'development-material'

  const sourceRoots = SOURCE_ROOTS.get(packageName) ?? []
  if (sourceRoots.includes(packageParts[0])) return 'published-source'

  if (packageName === 'node-pty') {
    const packagePath = packageParts.join('/')
    if (/^prebuilds\/(?:darwin-|win32-arm64)/u.test(packagePath)) return 'foreign-native-binary'
    if (/^third_party\/conpty\/[^/]+\/win10-arm64\//u.test(packagePath)) return 'foreign-native-binary'
  }

  if (packageName === 'pnpm') {
    const packagePath = packageParts.join('/')
    if (packageParts[0] === 'artifacts') return 'duplicate-runtime-artifact'
    if (packagePath === 'dist/vendor/fastlist-0.3.0-x86.exe') return 'foreign-native-binary'
  }

  return undefined
}

async function listFiles(root) {
  const pending = [root]
  const files = []
  while (pending.length > 0) {
    const directory = pending.pop()
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  return files
}

async function prunePackagedRuntime(nodeModulesRoot) {
  const files = await listFiles(nodeModulesRoot)
  const report = {
    removedBytes: 0,
    removedFiles: 0,
    categories: {},
  }

  for (const path of files) {
    const relativePath = relative(nodeModulesRoot, path)
    const category = classifyPrunableFile(relativePath)
    if (category === undefined) continue
    const metadata = await stat(path)
    await rm(path, { force: true })
    report.removedBytes += metadata.size
    report.removedFiles += 1
    report.categories[category] = (report.categories[category] ?? 0) + 1
  }

  return report
}

async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') {
    const appPath = join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
    )
    await execFileAsync('/usr/bin/codesign', [
      '--force',
      '--deep',
      '--sign',
      '-',
      appPath,
    ])
    process.stdout.write(`  - applied complete ad-hoc macOS signature  app=${appPath}\n`)
    return
  }
  if (context.electronPlatformName !== 'win32') return
  const nodeModulesRoot = join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
  )
  const report = await prunePackagedRuntime(nodeModulesRoot)
  const outputPath = join(context.outDir, 'runtime-prune-report.json')
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(
    `  - pruned desktop runtime  files=${report.removedFiles} bytes=${report.removedBytes}\n`,
  )
}

module.exports = afterPack
module.exports.classifyPrunableFile = classifyPrunableFile
module.exports.prunePackagedRuntime = prunePackagedRuntime
