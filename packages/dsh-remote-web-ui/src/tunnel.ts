/** On-demand Cloudflare quick-tunnel lifecycle for personal-device mode. */
import { existsSync } from 'node:fs'
import { bin, install, Tunnel } from 'cloudflared'

export type TunnelPhase = 'stopped' | 'starting' | 'running' | 'failed'

export interface TunnelInfo {
  phase: TunnelPhase
  url?: string
  error?: string
}

export interface TunnelHandle {
  on(event: string, listener: (...args: any[]) => void): unknown
  stop(): boolean
}

export interface TunnelManagerOptions {
  factory?: (targetUrl: string) => TunnelHandle
  ensureBinary?: () => Promise<void>
  /** Optional end-to-end verifier (primarily a test/integration seam). */
  verifyPublicUrl?: (url: string) => Promise<boolean>
  /** Bound the first-run cloudflared download/preparation step. */
  prepareTimeoutMs?: number
  /** Bound the edge/DNS verification for one announced hostname. */
  verifyTimeoutMs?: number
  urlTimeoutMs?: number
  restartBaseMs?: number
  restartMaxMs?: number
  timer?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(t: unknown): void }
}

async function defaultEnsureBinary(): Promise<void> {
  if (existsSync(bin)) return
  await install(bin)
}

function defaultFactory(targetUrl: string): TunnelHandle {
  // HTTP/2 over IPv4 works on substantially more home/campus networks than
  // cloudflared's preferred QUIC/UDP path; it also avoids long 1033 windows
  // when UDP is silently filtered by a router.
  return Tunnel.quick(targetUrl, {
    '--no-autoupdate': true,
    '--protocol': 'http2',
    '--edge-ip-version': '4',
  })
}

const nodeTimer = { setTimeout, clearTimeout }

export class TunnelManager {
  private readonly factory: (targetUrl: string) => TunnelHandle
  private readonly ensureBinary: () => Promise<void>
  private readonly verifyPublicUrl: ((url: string) => Promise<boolean>) | undefined
  private readonly prepareTimeoutMs: number
  private readonly verifyTimeoutMs: number
  private readonly urlTimeoutMs: number
  private readonly restartBaseMs: number
  private readonly restartMaxMs: number
  private readonly timer: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(t: unknown): void }

  private phase: TunnelPhase = 'stopped'
  private url: string | undefined
  private error: string | undefined
  private targetUrl: string | undefined
  private handle: TunnelHandle | undefined
  private urlTimer: unknown | undefined
  private restartTimer: unknown | undefined
  private attempts = 0
  private generation = 0
  private stopping = false
  private edgeConnected = false
  private candidateUrl: string | undefined
  private readonly urlListeners = new Set<(url: string) => void>()
  private readonly phaseListeners = new Set<(info: TunnelInfo) => void>()

  constructor(options: TunnelManagerOptions = {}) {
    this.factory = options.factory ?? defaultFactory
    this.ensureBinary = options.ensureBinary ?? defaultEnsureBinary
    this.verifyPublicUrl = options.verifyPublicUrl
    this.prepareTimeoutMs = options.prepareTimeoutMs ?? 30_000
    this.verifyTimeoutMs = options.verifyTimeoutMs ?? 35_000
    // A quick tunnel can need more than one DNS/edge propagation window.
    // The UI no longer treats this as a terminal timeout; this is only the
    // watchdog for one attempt before the manager schedules a reconnect.
    this.urlTimeoutMs = options.urlTimeoutMs ?? 60_000
    this.restartBaseMs = options.restartBaseMs ?? 5_000
    this.restartMaxMs = options.restartMaxMs ?? 60_000
    this.timer = options.timer ?? nodeTimer
  }

  get info(): TunnelInfo {
    return {
      phase: this.phase,
      ...(this.url !== undefined ? { url: this.url } : {}),
      ...(this.error !== undefined ? { error: this.error } : {}),
    }
  }

  start(targetUrl: string): void {
    if (this.targetUrl === targetUrl && (this.phase === 'starting' || this.phase === 'running')) return
    this.teardown()
    this.stopping = false
    this.targetUrl = targetUrl
    this.attempts = 0
    this.attempt()
  }

  stop(): void {
    this.teardown()
    this.stopping = false
    this.targetUrl = undefined
    this.setPhase('stopped')
  }

  dispose(): void { this.stop() }

  onUrl(listener: (url: string) => void): () => void {
    this.urlListeners.add(listener)
    return () => { this.urlListeners.delete(listener) }
  }

  onPhase(listener: (info: TunnelInfo) => void): () => void {
    this.phaseListeners.add(listener)
    return () => { this.phaseListeners.delete(listener) }
  }

  private attempt(): void {
    if (this.stopping || this.targetUrl === undefined) return
    const generation = ++this.generation
    this.setPhase('starting')
    this.handle = undefined
    this.edgeConnected = false
    this.candidateUrl = undefined
    this.url = undefined
    this.error = undefined
    void this.withTimeout(
      Promise.resolve().then(() => this.ensureBinary()),
      this.prepareTimeoutMs,
      'timed out preparing cloudflared; check network access and try again',
    ).then(() => {
      if (this.stopping || this.targetUrl === undefined || generation !== this.generation) return
      const handle = this.factory(this.targetUrl)
      this.handle = handle
      this.urlTimer = this.timer.setTimeout(() => {
        if (this.handle === handle) this.fail('timed out waiting for a public tunnel address')
      }, this.urlTimeoutMs)
      handle.on('url', (value: string) => {
        if (this.handle !== handle) return
        this.candidateUrl = value
        void this.maybePublish(handle, generation)
      })
      handle.on('connected', () => {
        if (this.handle !== handle) return
        this.edgeConnected = true
        void this.maybePublish(handle, generation)
      })
      handle.on('disconnected', () => {
        if (this.handle === handle && this.phase === 'running') {
          this.fail('the public tunnel disconnected from the Cloudflare edge')
        }
      })
      handle.on('exit', () => {
        if (this.handle === handle) this.fail('the public tunnel process exited unexpectedly')
      })
      handle.on('error', (value: unknown) => {
        if (this.handle !== handle) return
        const message = value instanceof Error ? value.message : String(value)
        this.fail(`public tunnel process error: ${message}`)
      })
    }).catch((value: unknown) => {
      if (this.stopping || generation !== this.generation) return
      const message = value instanceof Error ? value.message : String(value)
      this.fail(`could not prepare the public tunnel: ${message}`)
    })
  }

  private async maybePublish(handle: TunnelHandle, generation: number): Promise<void> {
    const value = this.candidateUrl
    if (value === undefined) return
    // cloudflared's `connected` event means its connector has registered at
    // the edge. This is the authoritative readiness signal in production.
    // A Node fetch is deliberately not used here: unlike the browser/system
    // network stack it ignores macOS proxy/PAC configuration and can report
    // ECONNRESET for a URL that is already reachable by the user's phone.
    if (this.verifyPublicUrl === undefined && !this.edgeConnected) return
    if (this.urlTimer !== undefined) {
      this.timer.clearTimeout(this.urlTimer)
      this.urlTimer = undefined
    }
    if (this.verifyPublicUrl !== undefined) {
      let reachable = false
      try {
        reachable = await this.withTimeout(
          Promise.resolve().then(() => this.verifyPublicUrl?.(value) ?? false),
          this.verifyTimeoutMs,
          'timed out verifying the public tunnel address',
        )
      } catch (error) {
        if (this.stopping || this.handle !== handle || generation !== this.generation) return
        this.fail(error instanceof Error ? error.message : String(error))
        return
      }
      if (this.stopping || this.handle !== handle || generation !== this.generation) return
      if (!reachable) {
        this.fail('the public address was created but never became reachable')
        return
      }
    }
    this.url = value
    this.error = undefined
    this.attempts = 0
    this.setPhase('running')
    for (const listener of this.urlListeners) {
      try { listener(value) } catch { /* a subscriber cannot break lifecycle */ }
    }
  }

  private fail(message: string): void {
    if (this.stopping) return
    this.url = undefined
    this.error = message
    this.generation += 1
    const handle = this.handle
    this.handle = undefined
    this.edgeConnected = false
    this.candidateUrl = undefined
    handle?.stop()
    if (this.urlTimer !== undefined) {
      this.timer.clearTimeout(this.urlTimer)
      this.urlTimer = undefined
    }
    this.setPhase('failed')
    this.attempts += 1
    const delayMs = Math.min(this.restartBaseMs * 2 ** (this.attempts - 1), this.restartMaxMs)
    this.restartTimer = this.timer.setTimeout(() => {
      this.restartTimer = undefined
      this.attempt()
    }, delayMs)
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timeout: unknown
    const deadline = new Promise<never>((_, reject) => {
      timeout = this.timer.setTimeout(() => reject(new Error(message)), timeoutMs)
    })
    try {
      return await Promise.race([operation, deadline])
    } finally {
      if (timeout !== undefined) this.timer.clearTimeout(timeout)
    }
  }

  private teardown(): void {
    this.stopping = true
    this.generation += 1
    if (this.urlTimer !== undefined) this.timer.clearTimeout(this.urlTimer)
    if (this.restartTimer !== undefined) this.timer.clearTimeout(this.restartTimer)
    this.urlTimer = undefined
    this.restartTimer = undefined
    this.handle?.stop()
    this.handle = undefined
    this.edgeConnected = false
    this.candidateUrl = undefined
    this.url = undefined
    this.error = undefined
  }

  private setPhase(phase: TunnelPhase): void {
    this.phase = phase
    const info = this.info
    for (const listener of this.phaseListeners) {
      try { listener(info) } catch { /* a subscriber cannot break lifecycle */ }
    }
  }
}
