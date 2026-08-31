import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import {
  DshRuntimeController,
  computeRestartDelay,
  diagnoseRuntimeLine,
  parseDshReadyUrl,
  probeHttpReady,
  validateLoopbackUrl,
} from '../src/runtime-controller.mjs'

class FakeChild extends EventEmitter {
  constructor() {
    super()
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.exitCode = null
    this.killed = false
  }

  kill() {
    this.killed = true
    this.exitCode = 0
    queueMicrotask(() => this.emit('exit', 0, 'SIGTERM'))
    return true
  }
}

test('ready parser accepts only the official loopback URL line', () => {
  assert.equal(parseDshReadyUrl('dsh web: http://127.0.0.1:43125'), 'http://127.0.0.1:43125/')
  assert.equal(parseDshReadyUrl('prefix dsh web: http://127.0.0.1:43125'), undefined)
  assert.throws(() => validateLoopbackUrl('https://127.0.0.1:43125'), /loopback HTTP/)
  assert.throws(() => validateLoopbackUrl('http://0.0.0.0:43125'), /loopback HTTP/)
  assert.throws(() => validateLoopbackUrl('http://[::]:43125'), /loopback HTTP/)
  assert.throws(() => validateLoopbackUrl('http://example.com:43125'), /loopback HTTP/)
  assert.throws(() => validateLoopbackUrl('http://user:pass@127.0.0.1:43125'), /credentials/)
})

test('restart schedule is bounded and exponential', () => {
  assert.equal(computeRestartDelay(0), 500)
  assert.equal(computeRestartDelay(1), 1_500)
  assert.equal(computeRestartDelay(2), 4_500)
  assert.equal(computeRestartDelay(3), undefined)
})

test('runtime diagnostics turn missing packages into an actionable message', () => {
  assert.equal(
    diagnoseRuntimeLine("Cannot find package '@deepseek-ai/dsh-credentials-local' imported from /profile"),
    '缺少运行插件：@deepseek-ai/dsh-credentials-local。请安装新版桌面端，或先点“修复 Profile”。',
  )
  assert.match(diagnoseRuntimeLine('listen EADDRINUSE 127.0.0.1:3000'), /端口/)
})

test('HTTP readiness probe waits through a short bind race', async () => {
  let calls = 0
  await probeHttpReady('http://127.0.0.1:43125/', {
    attempts: 3,
    delayMs: 0,
    schedule: (callback) => callback(),
    fetchImpl: async () => {
      calls += 1
      if (calls < 3) throw new Error('connection refused')
      return { ok: true }
    },
  })
  assert.equal(calls, 3)
})

test('controller reaches ready state from streamed output and stops cleanly', async () => {
  const child = new FakeChild()
  const logLines = []
  const states = []
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => child,
    logStore: { append: async (line) => logLines.push(line) },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
  })
  controller.on('status', (status) => states.push(status.state))

  const ready = controller.start()
  child.stdout.write('booting\r\ndsh web: http://127.0.0.1:43125 (LAN: http://10.0.0.2:43125)\r\n')
  assert.equal(await ready, 'http://127.0.0.1:43125/')
  assert.equal(controller.status.state, 'ready')
  assert.deepEqual(states.slice(0, 2), ['starting', 'ready'])
  assert.ok(logLines.some((line) => line.includes('booting')))

  await controller.stop()
  assert.equal(controller.status.state, 'stopped')
  assert.equal(child.killed, true)
})

test('controller fails closed if the runtime reports a non-loopback bind', async () => {
  const child = new FakeChild()
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: '/tmp/dsh-non-loopback-test',
    spawnProcess: () => child,
    logStore: { append: async () => {} },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
  })

  const ready = controller.start()
  child.stdout.write('dsh web: http://0.0.0.0:43125\n')

  await assert.rejects(ready, /loopback HTTP/)
  assert.equal(controller.status.state, 'crashed')
  assert.equal(child.killed, true)
})

test('personal public mode pins Harness to loopback and enables the tunnel through environment', async () => {
  const child = new FakeChild()
  let spawnArgs
  let spawnOptions
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: '/tmp/dsh-personal-test',
    remoteMode: 'personal-public',
    spawnProcess: (_executable, args, options) => {
      spawnArgs = args
      spawnOptions = options
      return child
    },
    logStore: { append: async () => {} },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
  })
  const ready = controller.start()
  child.stdout.write('dsh web: http://127.0.0.1:43125\n')
  await ready

  assert.equal(spawnOptions.env.DSH_DESKTOP_REMOTE_MODE, 'personal-public')
  assert.deepEqual(spawnArgs.slice(-5), ['--host', '127.0.0.1', '--port', '0', '--no-open'])
  await controller.stop()
})

test('controller injects only the loaded connector credential environment into the Host', async () => {
  const child = new FakeChild()
  let spawnOptions
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: '/tmp/dsh-connector-environment-test',
    environmentProvider: () => ({ DSH_CONNECTOR_GITHUB_GITHUB_TOKEN: 'secret-token' }),
    spawnProcess: (_executable, _args, options) => {
      spawnOptions = options
      return child
    },
    logStore: { append: async () => {} },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
  })
  const ready = controller.start()
  child.stdout.write('dsh web: http://127.0.0.1:43125\n')
  await ready
  assert.equal(spawnOptions.env.DSH_CONNECTOR_GITHUB_GITHUB_TOKEN, 'secret-token')
  await controller.stop()
})

test('controller rejects startup when the child exits before readiness', async () => {
  const child = new FakeChild()
  const controller = new DshRuntimeController({
    cliPath: 'dsh-bin.js',
    cwd: process.cwd(),
    dshHome: 'C:\\isolated-home',
    spawnProcess: () => child,
    logStore: { append: async () => {} },
    probeReady: async () => {},
    startupTimeoutMs: 2_000,
  })
  const ready = controller.start()
  child.emit('exit', 1, null)
  await assert.rejects(ready, /before readiness/)
  assert.equal(controller.status.state, 'crashed')
})
