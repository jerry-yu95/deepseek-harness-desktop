import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const REGISTRY_URL = 'https://registry.npmjs.org/@deepseek-ai%2Fdsh/latest'
const REGISTRY_METADATA_URL = 'https://registry.npmjs.org/@deepseek-ai%2Fdsh'
const SOURCE_PACKAGE_URL = 'https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/package.json'
const SOURCE_COMMITS_URL = 'https://api.github.com/repos/deepseek-ai/deepseek-harness/commits?path=package.json&per_page=1&sha=master'
const SOURCE_REPOSITORY_URL = 'https://github.com/deepseek-ai/deepseek-harness'
const SOURCE_ARCHIVE_URL = 'https://codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/'
const MAX_SOURCE_ARCHIVE_BYTES = 80 * 1024 * 1024
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/u
const OFFICIAL_RUNTIME_BUILD_DEPENDENCIES = [
  '@deepseek-ai/dsh-subprocess-local',
  '@google/genai',
  'koffi',
  'node-pty',
  'protobufjs',
]

function parseVersion(value) {
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) {
    throw new TypeError(`invalid DSH version: ${JSON.stringify(value)}`)
  }
  const [core, prerelease = ''] = value.split('-', 2)
  return { core: core.split('.').map(Number), prerelease: prerelease.split('.').filter(Boolean) }
}

export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return Math.sign(a.core[index] - b.core[index])
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length === 0 ? 1 : -1
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const x = a.prerelease[index]
    const y = b.prerelease[index]
    if (x === y) continue
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/u.test(x) ? Number(x) : undefined
    const yn = /^\d+$/u.test(y) ? Number(y) : undefined
    if (xn !== undefined && yn !== undefined) return Math.sign(xn - yn)
    if (xn !== undefined) return -1
    if (yn !== undefined) return 1
    return x.localeCompare(y)
  }
  return 0
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  const previous = `${path}.previous-${process.pid}-${Date.now()}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  let movedPrevious = false
  try {
    try {
      await rename(path, previous)
      movedPrevious = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (movedPrevious) await rm(previous, { force: true })
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    if (movedPrevious) await rename(previous, path).catch(() => {})
    throw error
  }
}

function resolvePackageRoot(packageName, anchor) {
  const require = createRequire(anchor)
  const manifest = require.resolve(`${packageName}/package.json`)
  return dirname(manifest)
}

export function packagedRuntime(anchor = import.meta.url) {
  const root = resolvePackageRoot('@deepseek-ai/dsh', anchor)
  const manifest = createRequire(anchor)(join(root, 'package.json'))
  return { version: manifest.version, root, cliPath: join(root, 'lib', 'bin.js'), source: 'packaged' }
}

function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const append = chunk => { output = `${output}${chunk.toString('utf8')}`.slice(-30_000) }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 180_000)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`process exited with code ${String(code)}\n${output}`))
    })
  })
}

export class DshUpdateManager {
  constructor({
    userData,
    profileDir,
    pnpmCli,
    executable = process.execPath,
    fetchImpl = fetch,
    packaged = packagedRuntime(),
    registryUrl = REGISTRY_URL,
    registryMetadataUrl,
    sourcePackageUrl = SOURCE_PACKAGE_URL,
    sourceCommitsUrl = SOURCE_COMMITS_URL,
    sourceArchiveUrl = SOURCE_ARCHIVE_URL,
    runner = runProcess,
  }) {
    this.root = join(userData, 'official-runtime')
    this.statePath = join(this.root, 'state.json')
    this.backupRoot = join(userData, 'profile-backups')
    this.profileDir = profileDir
    this.pnpmCli = pnpmCli
    this.executable = executable
    this.fetchImpl = fetchImpl
    this.packaged = packaged
    this.registryUrl = registryUrl
    this.registryMetadataUrl = registryMetadataUrl ?? (registryUrl === REGISTRY_URL ? REGISTRY_METADATA_URL : registryUrl)
    this.sourcePackageUrl = sourcePackageUrl
    this.sourceCommitsUrl = sourceCommitsUrl
    this.sourceArchiveUrl = sourceArchiveUrl
    this.runner = runner
    this.operation = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.operation.then(operation, operation)
    this.operation = result.catch(() => {})
    return result
  }

  async activeRuntime() {
    const state = await readJson(this.statePath)
    if (state?.active?.version && state?.active?.cliPath) {
      try {
        await readFile(state.active.cliPath)
        if (compareVersions(state.active.version, this.packaged.version) >= 0) {
          return { ...state.active, source: 'downloaded' }
        }
      } catch {
        // A missing or invalid downloaded runtime falls back to the packaged copy.
      }
    }
    return this.packaged
  }

  async status() {
    const [active, state] = await Promise.all([this.activeRuntime(), readJson(this.statePath)])
    return {
      currentVersion: active.version,
      source: active.source,
      previousVersion: state?.previous?.version,
      checkedVersion: state?.checked?.version,
      checkedAt: state?.checked?.at,
      latestPublishedAt: state?.checked?.publishedAt,
      latestDescription: state?.checked?.description,
      updateAvailable: state?.checked?.version
        ? compareVersions(state.checked.version, active.version) > 0
        : false,
      sourceRepository: SOURCE_REPOSITORY_URL,
      sourceVersion: state?.sourceChecked?.version,
      sourceCommit: state?.sourceChecked?.commit,
      sourceCommitUrl: state?.sourceChecked?.commitUrl,
      sourceCommitMessage: state?.sourceChecked?.commitMessage,
      sourceCommitDate: state?.sourceChecked?.commitDate,
      sourceCheckedAt: state?.sourceChecked?.at,
      sourceSnapshot: state?.sourceSnapshot
        ? {
            commit: state.sourceSnapshot.commit,
            version: state.sourceSnapshot.version,
            stagedAt: state.sourceSnapshot.stagedAt,
          }
        : undefined,
      sourceVersionAhead: state?.sourceChecked?.version
        ? compareVersions(state.sourceChecked.version, active.version) > 0
        : false,
      registryCheckError: state?.registryCheckError,
      sourceCheckError: state?.sourceCheckError,
    }
  }

  check() {
    return this.#enqueue(async () => {
      const [registryResult, sourceResult] = await Promise.allSettled([
        this.#fetchRegistryMetadata(),
        this.#fetchSourceMetadata(),
      ])
      const state = (await readJson(this.statePath)) ?? {}
      let successCount = 0
      if (registryResult.status === 'fulfilled') {
        state.checked = { ...registryResult.value, at: new Date().toISOString() }
        delete state.registryCheckError
        successCount += 1
      } else {
        state.registryCheckError = registryResult.reason?.message ?? 'official npm registry check failed'
      }
      if (sourceResult.status === 'fulfilled') {
        state.sourceChecked = { ...sourceResult.value, at: new Date().toISOString() }
        delete state.sourceCheckError
        successCount += 1
      } else {
        state.sourceCheckError = sourceResult.reason?.message ?? 'GitHub source check failed'
      }
      if (successCount === 0) {
        throw new Error(`official update checks failed: ${state.registryCheckError}; ${state.sourceCheckError}`)
      }
      await atomicJson(this.statePath, state)
      return this.status()
    })
  }

  async #fetchRegistryMetadata() {
    const response = await this.fetchImpl(this.registryMetadataUrl, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`official npm update check returned HTTP ${response.status}`)
    const metadata = await response.json()
    const version = typeof metadata?.['dist-tags']?.latest === 'string'
      ? metadata['dist-tags'].latest
      : metadata.version
    parseVersion(version)
    const versionMetadata = metadata?.versions?.[version] ?? metadata
    const publishedAt = typeof metadata?.time?.[version] === 'string' ? metadata.time[version] : undefined
    const description = typeof versionMetadata?.description === 'string' ? versionMetadata.description : undefined
    return { version, publishedAt, description }
  }

  async #fetchSourceMetadata() {
    const packageResponse = await this.fetchImpl(this.sourcePackageUrl, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (!packageResponse.ok) throw new Error(`GitHub source package check returned HTTP ${packageResponse.status}`)
    const packageMetadata = await packageResponse.json()
    parseVersion(packageMetadata.version)

    // The package version tells us about source release changes. The commit is
    // useful when master changed without bumping package.json yet. A rate limit
    // or transient API failure should not hide the source version itself.
    let commit
    let commitUrl
    let commitMessage
    let commitDate
    try {
      const commitsResponse = await this.fetchImpl(this.sourceCommitsUrl, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'harness-design-desktop',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      if (commitsResponse.ok) {
        const commits = await commitsResponse.json()
        if (Array.isArray(commits) && typeof commits[0]?.sha === 'string') {
          commit = commits[0].sha
          commitUrl = typeof commits[0].html_url === 'string' ? commits[0].html_url : undefined
          commitMessage = typeof commits[0].commit?.message === 'string' ? commits[0].commit.message.split('\n', 1)[0] : undefined
          commitDate = typeof commits[0].commit?.author?.date === 'string' ? commits[0].commit.author.date : undefined
        }
      }
    } catch {
      // The raw package endpoint remains the authoritative version check.
    }
    return { version: packageMetadata.version, commit, commitUrl, commitMessage, commitDate }
  }

  async #backupProfile() {
    const directory = join(this.backupRoot, new Date().toISOString().replaceAll(':', '-'))
    await mkdir(directory, { recursive: true })
    for (const filename of ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml', 'settings.yaml']) {
      try {
        await cp(join(this.profileDir, filename), join(directory, filename), { force: false })
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    return directory
  }

  install(version) {
    return this.#enqueue(async () => {
      parseVersion(version)
      const current = await this.activeRuntime()
      if (compareVersions(version, current.version) <= 0) throw new Error('the selected version is not newer than the active runtime')
      const stage = join(this.root, 'versions', version)
      await rm(stage, { recursive: true, force: true })
      await mkdir(stage, { recursive: true })
      await atomicJson(join(stage, 'package.json'), {
        name: 'dsh-official-runtime',
        private: true,
        dependencies: { '@deepseek-ai/dsh': version },
      })
      // pnpm 11 blocks dependency lifecycle scripts unless the workspace
      // explicitly approves them. The official runtime needs these known
      // native/codegen packages; keeping a fixed allowlist prevents a future
      // transitive dependency from gaining script execution automatically.
      const buildAllowlist = OFFICIAL_RUNTIME_BUILD_DEPENDENCIES.map(name => `  ${JSON.stringify(name)}: true`).join('\n')
      await writeFile(
        join(stage, 'pnpm-workspace.yaml'),
        `packages:\n  - .\n\nnodeLinker: hoisted\n\nallowBuilds:\n${buildAllowlist}\n`,
        'utf8',
      )
      const environment = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      await this.runner(this.executable, [this.pnpmCli, 'install', '--prod', '--frozen-lockfile=false'], {
        cwd: stage,
        env: environment,
        timeoutMs: 600_000,
      })
      const root = join(stage, 'node_modules', '@deepseek-ai', 'dsh')
      const installed = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
      if (installed.version !== version) throw new Error('installed runtime version did not match the requested version')
      const cliPath = join(root, 'lib', 'bin.js')
      await this.runner(this.executable, ['--expose-internals', cliPath, '--help'], {
        cwd: stage,
        env: environment,
        timeoutMs: 60_000,
      })
      const backup = await this.#backupProfile()
      const state = (await readJson(this.statePath)) ?? {}
      await atomicJson(this.statePath, {
        ...state,
        previous: { version: current.version, cliPath: current.cliPath, source: current.source },
        active: { version, cliPath, root },
        lastBackup: backup,
        installedAt: new Date().toISOString(),
      })
      return this.status()
    })
  }

  stageSource(commit) {
    return this.#enqueue(async () => {
      if (typeof commit !== 'string' || !COMMIT_PATTERN.test(commit)) {
        throw new TypeError('source commit must be a hexadecimal Git commit')
      }
      const state = (await readJson(this.statePath)) ?? {}
      const snapshotRoot = join(this.root, 'source-snapshots')
      const finalDirectory = join(snapshotRoot, commit)
      try {
        const manifest = JSON.parse(await readFile(join(finalDirectory, 'package.json'), 'utf8'))
        parseVersion(manifest.version)
        state.sourceSnapshot = {
          commit,
          version: manifest.version,
          directory: finalDirectory,
          stagedAt: state.sourceSnapshot?.commit === commit
            ? state.sourceSnapshot.stagedAt
            : new Date().toISOString(),
        }
        await atomicJson(this.statePath, state)
        return this.status()
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          await rm(finalDirectory, { recursive: true, force: true }).catch(() => {})
        }
      }
      const archiveUrl = `${this.sourceArchiveUrl}${encodeURIComponent(commit)}`
      const response = await this.fetchImpl(archiveUrl, {
        headers: { accept: 'application/gzip', 'user-agent': 'harness-design-desktop' },
        redirect: 'error',
        signal: AbortSignal.timeout(120_000),
      })
      if (!response.ok) throw new Error(`GitHub source download returned HTTP ${response.status}`)
      const contentLength = Number(response.headers?.get?.('content-length'))
      if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_ARCHIVE_BYTES) {
        throw new Error('GitHub source archive is larger than the safety limit')
      }
      if (typeof response.arrayBuffer !== 'function') throw new Error('GitHub source download did not return an archive body')
      const archive = Buffer.from(await response.arrayBuffer())
      if (archive.byteLength > MAX_SOURCE_ARCHIVE_BYTES) throw new Error('GitHub source archive is larger than the safety limit')

      const stageDirectory = join(snapshotRoot, `.staging-${commit}-${process.pid}-${Date.now()}`)
      const archivePath = join(snapshotRoot, `.archive-${commit}-${process.pid}-${Date.now()}.tar.gz`)
      await mkdir(snapshotRoot, { recursive: true })
      try {
        await writeFile(archivePath, archive, { flag: 'wx' })
        await mkdir(stageDirectory, { recursive: true })
        const tarExecutable = process.platform === 'win32' ? 'tar.exe' : 'tar'
        await this.runner(tarExecutable, ['-xzf', archivePath, '--strip-components=1', '--no-same-owner', '--no-same-permissions'], {
          cwd: stageDirectory,
          env: process.env,
          timeoutMs: 120_000,
        })
        const manifestPath = join(stageDirectory, 'package.json')
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        parseVersion(manifest.version)
        if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
          throw new Error('GitHub source snapshot has no package name')
        }
        await rename(stageDirectory, finalDirectory)
      } catch (error) {
        await rm(stageDirectory, { recursive: true, force: true }).catch(() => {})
        throw error
      } finally {
        await rm(archivePath, { force: true }).catch(() => {})
      }

      const manifest = JSON.parse(await readFile(join(finalDirectory, 'package.json'), 'utf8'))
      state.sourceSnapshot = {
        commit,
        version: manifest.version,
        directory: finalDirectory,
        stagedAt: new Date().toISOString(),
      }
      await atomicJson(this.statePath, state)
      return this.status()
    })
  }

  rollback() {
    return this.#enqueue(async () => {
      const state = await readJson(this.statePath)
      if (!state?.previous) throw new Error('no previous official runtime is available')
      const active = state.active
      state.active = state.previous.source === 'packaged' ? undefined : state.previous
      state.previous = active
      state.rolledBackAt = new Date().toISOString()
      await atomicJson(this.statePath, state)
      return this.status()
    })
  }
}
