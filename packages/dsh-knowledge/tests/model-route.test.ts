import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelRouteResolver } from '../src/core/model-route.ts'

function fixture() {
  const providers = [{ id: 'fixture-a', name: 'Fixture A' }, { id: 'fixture-b', name: 'Fixture B' }]
  const llm = {
    listProviders: () => providers,
    listModels: vi.fn(async (provider: string) => [{ provider, id: 'model', name: 'Model' }]),
  }
  return { providers, llm, resolver: new ModelRouteResolver({ llm, currentDefault: () => ({ provider: 'fixture-b', model: 'model' }), currentSession: id => id === 'live' ? { provider: 'fixture-a', model: 'model' } : undefined }) }
}

afterEach(() => vi.useRealTimers())

describe('configured model routes', () => {
  it('uses the official default without a live session and exposes only opaque IDs and labels', async () => {
    const { resolver } = fixture()
    const directory = await resolver.list()
    expect(directory.routes).toHaveLength(2)
    expect(Object.keys(directory.routes[0]).sort()).toEqual(['displayName', 'id'])
    const selected = await resolver.resolve(directory.selectedRouteId!)
    expect(selected).toEqual({ provider: 'fixture-b', model: 'model' })
    expect(await resolver.resolve((await resolver.list('live')).selectedRouteId!)).toEqual({ provider: 'fixture-a', model: 'model' })
  })

  it('revalidates a removed provider and never silently changes an explicit selection', async () => {
    const { resolver, providers } = fixture()
    const directory = await resolver.list()
    const id = directory.selectedRouteId!
    providers.pop()
    await expect(resolver.resolve(id)).rejects.toThrow('knowledge-model-route-unavailable')
    await expect(resolver.resolve('unknown')).rejects.toThrow('knowledge-model-route-unavailable')
  })

  it('returns an empty directory with no configured adapter', async () => {
    const { resolver, providers } = fixture()
    providers.splice(0)
    expect(await resolver.list()).toEqual({ routes: [] })
  })

  it('rejects a model removed from an otherwise registered provider', async () => {
    const { resolver, llm } = fixture()
    const { selectedRouteId } = await resolver.list()
    llm.listModels.mockResolvedValue([])
    await expect(resolver.resolve(selectedRouteId!)).rejects.toThrow('knowledge-model-route-unavailable')
  })

  it('keeps healthy provider routes when another provider catalog fails', async () => {
    const { resolver, llm } = fixture()
    llm.listModels.mockImplementation(async (provider: string) => {
      if (provider === 'fixture-a') throw new Error('synthetic catalog outage')
      return [{ provider, id: 'model', name: 'Model' }]
    })
    expect(await resolver.list()).toMatchObject({ routes: [{ displayName: 'fixture-b / model' }] })
  })

  it('does not expose unsafe metadata as display labels', async () => {
    const { resolver, providers } = fixture()
    providers[0].id = 'https://example.com/fixture'
    await expect(resolver.list()).rejects.toThrow('knowledge-model-route-unavailable')
  })

  it('honors cancellation and bounds a stalled directory lookup', async () => {
    const { resolver, llm } = fixture()
    const controller = new AbortController()
    llm.listModels.mockImplementation(() => new Promise(() => {}))
    const pending = resolver.list(undefined, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('knowledge-cancelled')
    vi.useFakeTimers()
    const timeout = resolver.list()
    const rejection = expect(timeout).rejects.toThrow('knowledge-model-timeout')
    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
  })
})
