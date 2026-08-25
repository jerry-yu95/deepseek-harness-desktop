import { createHash, randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import { parseSkillFrontmatter } from './skills.mjs'

export const SKILL_PACKAGE_LIMITS = Object.freeze({
  files: 2_000,
  bytes: 50 * 1024 * 1024,
})

const MANAGER = 'dsh-official-skill-installer'
const MANIFEST = 'skill.json'
const PROVENANCE = '.dsh-skill-install.json'
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const RUNTIMES = new Set(['none', 'node', 'python', 'shell'])
const ALLOWED_SOURCE_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'gitlab.com',
  'npmjs.com',
  'www.npmjs.com',
  'registry.npmjs.org',
  'meeting.tencent.com',
  'cloud.tencent.com',
  'work.weixin.qq.com',
  'weixin.qq.com',
  'tapd.cn',
  'dingtalk.com',
])
const CREDENTIAL_PATTERNS = [
  /\bghp_[A-Za-z0-9]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/u,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bAIza[0-9A-Za-z_-]{20,}\b/u,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{24,}\b/iu,
  /\b(?:api[_-]?key|access[_-]?token|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{24,}["']?/iu,
]

function fail(message) {
  throw new Error(message)
}

export function validatePackagePath(value) {
  if (typeof value !== 'string' || value.length === 0) fail('package path is required')
  if (value.includes('\0')) fail('package path contains a NUL byte')
  const normalized = value.replaceAll('\\', '/')
  if (isAbsolute(normalized) || /^[A-Za-z]:\//u.test(normalized)) fail('absolute path is not accepted')
  const segments = normalized.split('/')
  if (segments.includes('..')) fail('path traversal is not accepted')
  if (segments.some((segment) => segment.length === 0 || segment === '.')) fail('package path contains an empty segment')
  return normalized
}

function validateName(name) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) fail('skill package name must be kebab-case')
  return name
}

function validateVersion(version) {
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) fail('skill package version must be semver')
  return version
}

function readOptionalJson(path) {
  return readFile(path, 'utf8').then((content) => {
    let value
    try {
      value = JSON.parse(content)
    } catch {
      fail('skill package manifest is not valid JSON')
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('skill package manifest must be an object')
    return value
  }).catch((error) => {
    if (error?.code === 'ENOENT') return undefined
    throw error
  })
}

async function readManifest(sourceDirectory, metadata) {
  const manifest = await readOptionalJson(join(sourceDirectory, MANIFEST))
  if (!manifest) {
    return { name: metadata.name, version: '0.0.0', runtime: 'none', scripts: [] }
  }
  const name = manifest.name === undefined ? metadata.name : validateName(manifest.name)
  if (name !== metadata.name) fail('skill package manifest name does not match SKILL.md')
  const version = manifest.version === undefined ? '0.0.0' : validateVersion(manifest.version)
  const runtime = manifest.runtime === undefined ? 'none' : manifest.runtime
  if (typeof runtime !== 'string' || !RUNTIMES.has(runtime)) fail('unsupported runtime in skill package manifest')
  const scripts = manifest.scripts === undefined ? [] : manifest.scripts
  if (!Array.isArray(scripts) || scripts.some((script) => typeof script !== 'string')) {
    fail('skill package manifest scripts must be an array of paths')
  }
  const normalizedScripts = scripts.map((script) => {
    const normalized = validatePackagePath(script)
    if (!normalized.startsWith('scripts/')) fail('declared skill scripts must live under scripts/')
    return normalized
  }).toSorted()
  return { name, version, runtime, scripts: normalizedScripts }
}

function validateSourceUrl(value, field) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') fail(`${field} must be an HTTPS URL`)
  let url
  try {
    url = new URL(value)
  } catch {
    fail(`${field} must be an HTTPS URL`)
  }
  if (url.protocol !== 'https:') fail(`${field} must use HTTPS`)
  if (url.username || url.password) fail(`${field} must not contain credentials`)
  if (!ALLOWED_SOURCE_HOSTS.has(url.hostname.toLowerCase())) fail(`${field} host is not allowlisted`)
  return url.toString()
}

function validateSource({ sourceUrl, resolvedSourceUrl }) {
  const source = validateSourceUrl(sourceUrl, 'source URL')
  const resolved = validateSourceUrl(resolvedSourceUrl ?? sourceUrl, 'resolved source URL')
  return { sourceUrl: source, resolvedSourceUrl: resolved }
}

function looksTextual(buffer) {
  return !buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0)
}

function assertNoEmbeddedCredential(relativePath, buffer) {
  if (!looksTextual(buffer)) return
  const content = buffer.toString('utf8')
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(content))) {
    fail(`skill package contains a credential-shaped value in ${relativePath}`)
  }
}

async function collectFiles(root, current, budget, files) {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = join(current, entry.name)
    const relativePath = validatePackagePath(relative(root, entryPath).split(sep).join('/'))
    const metadata = await lstat(entryPath)
    if (metadata.isSymbolicLink()) fail('skill packages containing symbolic links are not accepted')
    if (metadata.isDirectory()) {
      await collectFiles(root, entryPath, budget, files)
      continue
    }
    if (!metadata.isFile()) fail(`unsupported filesystem entry in skill package: ${relativePath}`)
    budget.files += 1
    if (budget.files > SKILL_PACKAGE_LIMITS.files) fail('skill package contains too many files')
    budget.bytes += metadata.size
    if (budget.bytes > SKILL_PACKAGE_LIMITS.bytes) fail('skill package exceeds 50 MB')
    const buffer = await readFile(entryPath)
    assertNoEmbeddedCredential(relativePath, buffer)
    if ((metadata.mode & 0o111) !== 0 && !relativePath.startsWith('scripts/')) {
      fail(`executable file outside scripts/ is not accepted: ${relativePath}`)
    }
    files.push({ relativePath, absolutePath: entryPath, size: metadata.size, mode: metadata.mode })
  }
}

async function assertSourceDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== 'string' || sourceDirectory.length === 0) fail('skill package source directory is required')
  const source = resolve(sourceDirectory)
  const metadata = await lstat(source)
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) fail('skill package source must be a real directory')
  return source
}

async function inspectPackage({ sourceDirectory, sourceUrl, resolvedSourceUrl, expectedSha256 }) {
  const source = await assertSourceDirectory(sourceDirectory)
  const metadata = parseSkillFrontmatter(await readFile(join(source, 'SKILL.md'), 'utf8'))
  const manifest = await readManifest(source, metadata)
  const sourceInfo = validateSource({ sourceUrl, resolvedSourceUrl })
  const budget = { files: 0, bytes: 0 }
  const files = []
  await collectFiles(source, source, budget, files)
  const byName = new Set(files.map((file) => file.relativePath))
  if (!byName.has('SKILL.md')) fail('skill package must contain SKILL.md')
  for (const script of manifest.scripts) {
    if (!byName.has(script)) fail(`declared skill script does not exist: ${script}`)
  }
  const digest = createHash('sha256')
  for (const file of files.toSorted((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    digest.update(file.relativePath)
    digest.update('\0')
    digest.update(await readFile(file.absolutePath))
  }
  const sha256 = digest.digest('hex')
  if (expectedSha256 !== undefined && (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedSha256) || expectedSha256 !== sha256)) {
    fail('skill package checksum mismatch')
  }
  return { source, metadata, manifest, sourceInfo, files, bytes: budget.bytes, sha256 }
}

export async function previewSkillPackage(options) {
  const inspected = await inspectPackage(options)
  const sourceUrl = inspected.sourceInfo.sourceUrl
  return {
    name: inspected.metadata.name,
    description: inspected.metadata.description,
    version: inspected.manifest.version,
    runtime: inspected.manifest.runtime,
    scripts: inspected.manifest.scripts,
    files: inspected.files.map((file) => file.relativePath).toSorted(),
    bytes: inspected.bytes,
    sha256: inspected.sha256,
    sourceUrl,
    verification: {
      tier: sourceUrl ? 'source-allowlisted' : 'local-import',
      status: 'pending-live-review',
    },
  }
}

async function readProvenance(target) {
  try {
    const value = JSON.parse(await readFile(join(target, PROVENANCE), 'utf8'))
    if (!value || value.manager !== MANAGER || typeof value.name !== 'string') return undefined
    return value
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    return undefined
  }
}

function targetFor(targetRoot, name) {
  validateName(name)
  const root = resolve(targetRoot)
  const target = resolve(root, name)
  if (relative(root, target).startsWith(`..${sep}`) || isAbsolute(relative(root, target))) fail('skill target escapes target root')
  return { root, target }
}

async function backupExisting({ root, target, name, version }) {
  const provenance = await readProvenance(target)
  if (!provenance) fail(`skill ${name} is user-managed and cannot be overwritten`)
  const backupRoot = join(root, '.dsh-skill-backups', name)
  await mkdir(backupRoot, { recursive: true })
  const backup = join(backupRoot, `${version}-${Date.now()}-${randomUUID()}`)
  await rename(target, backup)
  return backup
}

export async function installSkillPackage({ sourceDirectory, targetRoot, sourceUrl, resolvedSourceUrl, expectedSha256 }) {
  const inspected = await inspectPackage({ sourceDirectory, sourceUrl, resolvedSourceUrl, expectedSha256 })
  const { root, target } = targetFor(targetRoot, inspected.metadata.name)
  await mkdir(root, { recursive: true })
  const temporary = join(root, `.dsh-skill-stage-${inspected.metadata.name}-${randomUUID()}`)
  let backup
  try {
    await cp(inspected.source, temporary, { recursive: true, dereference: false, errorOnExist: true, force: false })
    const provenance = {
      manager: MANAGER,
      schemaVersion: 1,
      name: inspected.metadata.name,
      version: inspected.manifest.version,
      sourceUrl: inspected.sourceInfo.sourceUrl,
      resolvedSourceUrl: inspected.sourceInfo.resolvedSourceUrl,
      sha256: inspected.sha256,
      installedAt: new Date().toISOString(),
      verificationTier: inspected.sourceInfo.sourceUrl ? 'source-allowlisted' : 'local-import',
    }
    await writeFile(join(temporary, PROVENANCE), `${JSON.stringify(provenance, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    try {
      await lstat(target)
      backup = await backupExisting({ root, target, name: inspected.metadata.name, version: inspected.manifest.version })
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    if (backup) {
      try {
        await rename(backup, target)
      } catch {
        // Keep the backup in place for manual recovery if restoration itself fails.
      }
    }
    throw error
  }
  return {
    name: inspected.metadata.name,
    description: inspected.metadata.description,
    version: inspected.manifest.version,
    runtime: inspected.manifest.runtime,
    sha256: inspected.sha256,
    sourceUrl: inspected.sourceInfo.sourceUrl,
    path: join(target, 'SKILL.md'),
    container: target,
    provenancePath: join(target, PROVENANCE),
  }
}

async function latestBackup(root, name) {
  const backupRoot = join(root, '.dsh-skill-backups', name)
  let entries
  try {
    entries = await readdir(backupRoot, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
  for (const entry of entries.toSorted((left, right) => right.name.localeCompare(left.name))) {
    if (!entry.isDirectory()) continue
    const candidate = join(backupRoot, entry.name)
    if (await readProvenance(candidate)) return candidate
  }
  return undefined
}

export async function rollbackSkillPackage({ targetRoot, name }) {
  const { root, target } = targetFor(targetRoot, name)
  if (!await readProvenance(target)) fail(`skill ${name} is not app-managed`)
  const backup = await latestBackup(root, name)
  if (!backup) fail(`skill ${name} has no app-managed rollback version`)
  const temporary = join(root, `.dsh-skill-rollback-${name}-${randomUUID()}`)
  await rename(target, temporary)
  try {
    await rename(backup, target)
  } catch (error) {
    await rename(temporary, target)
    throw error
  }
  await rm(temporary, { recursive: true, force: true })
  const provenance = await readProvenance(target)
  return { name, version: provenance?.version, path: join(target, 'SKILL.md'), container: target }
}

export async function removeSkillPackage({ targetRoot, name }) {
  const { root, target } = targetFor(targetRoot, name)
  if (!await readProvenance(target)) fail(`skill ${name} is not app-managed`)
  await rm(target, { recursive: true, force: false })
  await rm(join(root, '.dsh-skill-backups', name), { recursive: true, force: true })
  return { name, removed: true }
}
