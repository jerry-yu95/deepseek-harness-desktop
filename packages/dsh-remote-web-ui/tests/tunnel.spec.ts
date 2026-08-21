import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { TunnelManager, type TunnelHandle } from '../src/tunnel.ts'

class FakeTunnel extends EventEmitter implements TunnelHandle {
  stop = vi.fn(() => true)
}

describe('personal public tunnel readiness', () => {
  it('turns a stuck cloudflared preparation into a recoverable failure', async () => {
    const manager = new TunnelManager({
      ensureBinary: () => new Promise<void>(() => {}),
      prepareTimeoutMs: 10,
      restartBaseMs: 60_000,
    })
    manager.start('http://127.0.0.1:3080')

    await vi.waitFor(() => expect(manager.info.phase).toBe('failed'))
    expect(manager.info.error).toContain('timed out preparing cloudflared')
    manager.stop()
  })

  it('turns a stuck public health check into a recoverable failure', async () => {
    const process = new FakeTunnel()
    const manager = new TunnelManager({
      ensureBinary: async () => {},
      factory: () => process,
      verifyPublicUrl: () => new Promise<boolean>(() => {}),
      verifyTimeoutMs: 10,
      restartBaseMs: 60_000,
    })
    manager.start('http://127.0.0.1:3080')
    await vi.waitFor(() => expect(process.listenerCount('url')).toBe(1))
    process.emit('url', 'https://stuck.trycloudflare.com')

    await vi.waitFor(() => expect(manager.info.phase).toBe('failed'))
    expect(manager.info.error).toContain('timed out verifying')
    manager.stop()
  })

  it('does not publish a QR base before end-to-end reachability succeeds', async () => {
    const process = new FakeTunnel()
    let finishVerification: ((value: boolean) => void) | undefined
    const verifyPublicUrl = vi.fn(() => new Promise<boolean>(resolve => { finishVerification = resolve }))
    const manager = new TunnelManager({
      ensureBinary: async () => {},
      factory: () => process,
      verifyPublicUrl,
    })
    const urls: string[] = []
    manager.onUrl(url => { urls.push(url) })

    manager.start('http://127.0.0.1:3080')
    await vi.waitFor(() => expect(process.listenerCount('url')).toBe(1))
    process.emit('url', 'https://ready-later.trycloudflare.com')
    await vi.waitFor(() => expect(verifyPublicUrl).toHaveBeenCalled())
    expect(manager.info.phase).toBe('starting')
    expect(urls).toEqual([])

    finishVerification?.(true)
    await vi.waitFor(() => expect(manager.info.phase).toBe('running'))
    expect(urls).toEqual(['https://ready-later.trycloudflare.com'])
    manager.stop()
  })

  it('never advertises a hostname whose public health check fails', async () => {
    const process = new FakeTunnel()
    const manager = new TunnelManager({
      ensureBinary: async () => {},
      factory: () => process,
      verifyPublicUrl: async () => false,
      restartBaseMs: 60_000,
    })
    const urls: string[] = []
    manager.onUrl(url => { urls.push(url) })
    manager.start('http://127.0.0.1:3080')
    await vi.waitFor(() => expect(process.listenerCount('url')).toBe(1))
    process.emit('url', 'https://dead.trycloudflare.com')

    await vi.waitFor(() => expect(manager.info.phase).toBe('failed'))
    expect(manager.info.error).toContain('never became reachable')
    expect(urls).toEqual([])
    manager.stop()
  })

  it('turns tunnel process errors into a reconnecting failed state', async () => {
    const process = new FakeTunnel()
    const manager = new TunnelManager({
      ensureBinary: async () => {},
      factory: () => process,
      restartBaseMs: 60_000,
    })
    manager.start('http://127.0.0.1:3080')
    await vi.waitFor(() => expect(process.listenerCount('error')).toBe(1))
    process.emit('error', new Error('network unavailable'))
    await vi.waitFor(() => expect(manager.info.phase).toBe('failed'))
    expect(manager.info.error).toContain('network unavailable')
    expect(process.stop).toHaveBeenCalled()
    manager.stop()
  })

  it('publishes after cloudflared registers its edge connection without a Node fetch', async () => {
    const process = new FakeTunnel()
    const manager = new TunnelManager({
      ensureBinary: async () => {},
      factory: () => process,
    })
    const urls: string[] = []
    manager.onUrl(url => { urls.push(url) })
    manager.start('http://127.0.0.1:3080')
    await vi.waitFor(() => expect(process.listenerCount('url')).toBe(1))

    process.emit('url', 'https://edge-ready.trycloudflare.com')
    expect(manager.info.phase).toBe('starting')
    process.emit('connected', { id: 'test' })

    await vi.waitFor(() => expect(manager.info.phase).toBe('running'))
    expect(urls).toEqual(['https://edge-ready.trycloudflare.com'])
    manager.stop()
  })
})
