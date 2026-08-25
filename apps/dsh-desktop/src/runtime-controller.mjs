import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

const READY_LINE = /^dsh web:\s+(http:\/\/\S+)/u
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const REMOTE_MODES = new Set(['local', 'personal-public'])
const CONNECTOR_ENV_PATTERN = /^DSH_CONNECTOR_[A-Z0-9_]+$/u

export function validateLoopbackUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new TypeError(`invalid runtime URL: ${JSON.stringify(value)}`)
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new TypeError('runtime URL must use loopback HTTP')
  }
  if (url.username || url.password) throw new TypeError('runtime URL must not contain credentials')
  if (!url.port) throw new TypeError('runtime URL must contain an explicit port')
  return `${url.origin}/`
}

export function parseDshReadyUrl(line) {
  const match = READY_LINE.exec(String(line).trim())
  if (match === null) return undefined
  return validateLoopbackUrl(match[1])
}

export function computeRestartDelay(attempt, maxAttempts = 3) {
  if (!Number.isInteger(attempt) || attempt < 0) throw new TypeError('restart attempt must be non-negative')
  if (attempt >= maxAttempts) return undefined
  return Math.min(15_000, 500 * 3 ** attempt)
}

export function diagnoseRuntimeLine(line) {
  const text = String(line)
  const missing = /Cannot find package '([^']+)'/u.exec(text)
  if (missing) return `缺少运行插件：${missing[1]}。请安装新版桌面端，或先点“修复 Profile”。`
  if (/EADDRINUSE|address already in use/iu.test(text)) return '本地端口被其他程序占用，请退出旧的 Harness 进程后重试。'
  if (/EACCES|EPERM|operation not permitted/iu.test(text)) return '运行时没有足够的本地权限。请检查应用与工作区权限后重试。'
  return undefined
}

export async function probeHttpReady(
  url,
  { fetchImpl = fetch, attempts = 30, delayMs = 50, schedule = setTimeout } = {},
) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
      lastError = new Error(`runtime health probe returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => schedule(resolve, delayMs))
  }
  throw new Error(`runtime URL did not accept HTTP requests: ${lastError?.message ?? 'unknown error'}`)
}

function createLineReader(onLine) {
  let buffer = ''
  return {
    write(chunk) {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/u)
      buffer = lines.pop() ?? ''
      for (const line of lines) onLine(line)
    },
    end() {
      if (buffer) onLine(buffer)
      buffer = ''
    },
  }
}

export class DshRuntimeController extends EventEmitter {
  constructor({
    cliPath,
    cwd,
    dshHome,
    executable = process.execPath,
    spawnProcess = spawn,
    logStore,
    startupTimeoutMs = 30_000,
    shutdownTimeoutMs = 5_000,
    autoRestart = false,
    probeReady = probeHttpReady,
    schedule = setTimeout,
    cancelSchedule = clearTimeout,
    remoteMode = 'local',
    environmentProvider = () => ({}),
  }) {
    super()
    if (!cliPath || !cwd || !dshHome) throw new TypeError('cliPath, cwd, and dshHome are required')
    this.cliPath = cliPath
    this.cwd = cwd
    this.dshHome = dshHome
    this.executable = executable
    this.spawnProcess = spawnProcess
    this.logStore = logStore ?? { append: async () => {} }
    this.startupTimeoutMs = startupTimeoutMs
    this.shutdownTimeoutMs = shutdownTimeoutMs
    this.autoRestart = autoRestart
    this.probeReady = probeReady
    this.schedule = schedule
    this.cancelSchedule = cancelSchedule
    if (typeof environmentProvider !== 'function') throw new TypeError('environmentProvider must be a function')
    this.environmentProvider = environmentProvider
    this.setRemoteMode(remoteMode)
    this.child = undefined
    this.readyPromise = undefined
    this.restartTimer = undefined
    this.restartAttempt = 0
    this.manualStop = false
    this.lastDiagnostic = undefined
    this.stopResolver = undefined
    this.status = Object.freeze({ state: 'stopped', url: undefined, error: undefined })
  }

  setCliPath(cliPath) {
    if (typeof cliPath !== 'string' || cliPath.length === 0) throw new TypeError('cliPath is required')
    if (this.child !== undefined || !['stopped', 'crashed'].includes(this.status.state)) {
      throw new Error('the DSH runtime must be stopped before changing its executable')
    }
    this.cliPath = cliPath
  }

  setRemoteMode(mode) {
    if (!REMOTE_MODES.has(mode)) throw new TypeError(`invalid remote mode: ${JSON.stringify(mode)}`)
    if (this.child !== undefined || !['stopped', 'crashed'].includes(this.status?.state ?? 'stopped')) {
      throw new Error('the DSH runtime must be stopped before changing remote mode')
    }
    this.remoteMode = mode
  }

  #setStatus(state, details = {}) {
    this.status = Object.freeze({
      state,
      url: details.url,
      error: details.error,
      restartAttempt: this.restartAttempt,
      pid: this.child?.pid,
    })
    this.emit('status', this.status)
  }

  start({ preserveRestartAttempt = false } = {}) {
    if (this.status.state === 'ready') return Promise.resolve(this.status.url)
    if (this.readyPromise) return this.readyPromise
    if (!preserveRestartAttempt) this.restartAttempt = 0
    this.manualStop = false
    this.lastDiagnostic = undefined
    this.#setStatus('starting')

    const readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.readyPromise = readyPromise

    try {
      const connectorEnvironment = this.environmentProvider()
      if (!connectorEnvironment || typeof connectorEnvironment !== 'object' || Array.isArray(connectorEnvironment)) {
        throw new TypeError('connector environment must be an object')
      }
      if (Object.keys(connectorEnvironment).some((key) => !CONNECTOR_ENV_PATTERN.test(key))) {
        throw new TypeError('connector environment contains an invalid reference')
      }
      if (Object.values(connectorEnvironment).some((value) => typeof value !== 'string' || value.length === 0)) {
        throw new TypeError('connector environment contains an invalid value')
      }
      const ambientEnvironment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !CONNECTOR_ENV_PATTERN.test(key)),
      )
      const environment = {
        ...ambientEnvironment,
        ...connectorEnvironment,
        DSH_HOME: this.dshHome,
        ELECTRON_RUN_AS_NODE: '1',
        DSH_DESKTOP_REMOTE_MODE: this.remoteMode,
      }
      this.child = this.spawnProcess(
        this.executable,
        [
          '--expose-internals', this.cliPath, '--profile', 'desktop',
          '--host', '127.0.0.1', '--port', '0',
        ],
        {
          cwd: this.cwd,
          env: environment,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      )
    } catch (error) {
      this.#failBeforeReady(error)
      return readyPromise
    }

    const stdout = createLineReader((line) => this.#handleLine('stdout', line))
    const stderr = createLineReader((line) => this.#handleLine('stderr', line))
    this.child.stdout?.on('data', (chunk) => stdout.write(chunk))
    this.child.stdout?.on('end', () => stdout.end())
    this.child.stderr?.on('data', (chunk) => stderr.write(chunk))
    this.child.stderr?.on('end', () => stderr.end())
    this.child.once('error', (error) => this.#handleChildError(error))
    this.child.once('exit', (code, signal) => this.#handleExit(code, signal))
    this.startupTimer = this.schedule(() => {
      if (this.status.state !== 'starting') return
      const error = new Error(`DSH runtime did not become ready within ${this.startupTimeoutMs}ms`)
      this.#failBeforeReady(error)
      this.child?.kill('SIGKILL')
    }, this.startupTimeoutMs)
    return readyPromise
  }

  async #handleLine(stream, line) {
    await this.logStore.append(`[${stream}] ${line}`)
    this.lastDiagnostic = diagnoseRuntimeLine(line) ?? this.lastDiagnostic
    this.emit('line', { stream, line })
    if (stream !== 'stdout' || this.status.state !== 'starting') return
    let url
    try {
      url = parseDshReadyUrl(line)
    } catch (error) {
      this.#failBeforeReady(error)
      this.child?.kill('SIGKILL')
      return
    }
    if (url === undefined) return
    try {
      await this.probeReady(url)
    } catch (error) {
      if (this.status.state === 'starting') {
        this.#failBeforeReady(error)
        this.child?.kill('SIGKILL')
      }
      return
    }
    if (this.status.state !== 'starting') return
    this.cancelSchedule(this.startupTimer)
    this.startupTimer = undefined
    this.#setStatus('ready', { url })
    this.resolveReady?.(url)
    this.resolveReady = undefined
    this.rejectReady = undefined
    this.readyPromise = undefined
  }

  #failBeforeReady(error) {
    this.cancelSchedule(this.startupTimer)
    this.startupTimer = undefined
    this.#setStatus('crashed', { error: error.message })
    this.rejectReady?.(error)
    this.resolveReady = undefined
    this.rejectReady = undefined
    this.readyPromise = undefined
  }

  #handleChildError(error) {
    void this.logStore.append(`[process] ${error.message}`)
    if (this.status.state === 'starting') this.#failBeforeReady(error)
  }

  #handleExit(code, signal) {
    this.cancelSchedule(this.startupTimer)
    this.startupTimer = undefined
    const previousState = this.status.state
    this.child = undefined
    void this.logStore.append(`[process] exited code=${String(code)} signal=${String(signal)}`)

    if (previousState === 'starting' && this.rejectReady) {
      this.#failBeforeReady(new Error(this.lastDiagnostic ?? `DSH runtime exited before readiness with code ${String(code)}`))
    }
    if (this.manualStop || previousState === 'stopping') {
      this.#setStatus('stopped')
      this.stopResolver?.()
      this.stopResolver = undefined
      return
    }
    if (previousState !== 'crashed') {
      this.#setStatus('crashed', { error: this.lastDiagnostic ?? `runtime exited with code ${String(code)}` })
    }
    if (this.autoRestart) this.#scheduleRestart()
  }

  #scheduleRestart() {
    const delay = computeRestartDelay(this.restartAttempt)
    if (delay === undefined) return
    this.restartAttempt += 1
    this.#setStatus('restarting', { error: this.status.error })
    this.restartTimer = this.schedule(() => {
      this.restartTimer = undefined
      this.start({ preserveRestartAttempt: true }).catch(() => {})
    }, delay)
  }

  async stop() {
    if (this.status.state === 'stopped') return
    this.manualStop = true
    if (this.restartTimer !== undefined) {
      this.cancelSchedule(this.restartTimer)
      this.restartTimer = undefined
    }
    this.#setStatus('stopping')
    const child = this.child
    if (child === undefined || child.exitCode !== null) {
      this.child = undefined
      this.#setStatus('stopped')
      return
    }
    const exited = new Promise((resolve) => {
      this.stopResolver = resolve
    })
    child.kill('SIGTERM')
    const forceTimer = this.schedule(() => child.kill('SIGKILL'), this.shutdownTimeoutMs)
    await exited
    this.cancelSchedule(forceTimer)
  }

  async restart() {
    await this.stop()
    return this.start()
  }
}
