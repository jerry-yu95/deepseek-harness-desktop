import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cacheKey, cached, harnessContextSync, harnessDir, initHarness, loadHarness, readCache, redactSecrets, retrieveMemory, sanitizeTrajectory, setOrchestrationMode, stableDigest, transitionHarness, updateFeature, writeCache } from '../src/core.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('native harness state', () => {
  it('enforces evidence before completion', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-harness-')); roots.push(cwd)
    await initHarness(cwd, 'Ship safely', ['Tests pass'])
    await transitionHarness(cwd, 'executing'); await transitionHarness(cwd, 'evaluating')
    await expect(transitionHarness(cwd, 'complete')).rejects.toThrow(/passed-features-with-evidence/)
    await updateFeature(cwd, 'F1', 'passed', 'vitest: 12 passed')
    expect((await transitionHarness(cwd, 'complete')).run.phase).toBe('complete')
    expect(harnessContextSync(cwd)).toContain('Acceptance: 1/1 passed')
  })

  it('redacts secrets and excludes hidden trajectory kinds', () => {
    expect(redactSecrets('api_key=abc123 token:xyz')).not.toContain('abc123')
    expect(redactSecrets('sk-1234567890abcdef Bearer abc.def.ghi')).toBe('[REDACTED] Bearer [REDACTED]')
    const view = sanitizeTrajectory([{ kind: 'thinking', text: 'private chain' }, { kind: 'user', text: 'hello' }, { kind: 'tool', name: 'read', text: 'token=hidden', ok: true }])
    expect(view).toContain('[user] hello'); expect(view).not.toContain('private chain'); expect(view).not.toContain('hidden')
  })

  it('bounds memory retrieval to three relevant snippets', () => {
    const result = retrieveMemory('agent context', ['agent context alpha', 'unrelated', 'agent beta', 'context gamma', 'agent context delta'].join('\n\n'))
    expect(result).toHaveLength(3); expect(result.join(' ')).not.toContain('unrelated')
  })

  it('migrates v1 state and persists explicit enhanced mode', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-harness-')); roots.push(cwd)
    const root = harnessDir(cwd)
    await writeFile(join(cwd, '.placeholder'), '')
    await initHarness(cwd, 'temporary')
    await writeFile(join(root, 'run.json'), JSON.stringify({ version: 1, objective: 'Legacy goal', phase: 'planning', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }))
    expect((await loadHarness(cwd))?.run.orchestration.mode).toBe('standard')
    expect((await setOrchestrationMode(cwd, 'enhanced')).run.orchestration.mode).toBe('enhanced')
    expect(JSON.parse(await readFile(join(root, 'run.json'), 'utf8')).version).toBe(2)
  })

  it('uses stable project cache keys and expires incompatible entries', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-harness-')); roots.push(cwd)
    expect(stableDigest({ b: 2, a: 1 })).toBe(stableDigest({ a: 1, b: 2 }))
    const key = cacheKey('planner', { objective: 'Ship', head: 'abc' })
    await writeCache(cwd, 'planner', key, 'planner-v1', { plan: ['test'] }, 1000)
    expect(await readCache(cwd, 'planner', key, 'planner-v1')).toEqual({ hit: true, value: { plan: ['test'] } })
    expect((await readCache(cwd, 'planner', key, 'planner-v2')).hit).toBe(false)
    await writeCache(cwd, 'planner', key, 'planner-v1', { plan: ['test'] }, 1)
    expect((await readCache(cwd, 'planner', key, 'planner-v1', Date.now() + 100)).hit).toBe(false)
  })

  it('recovers corrupt cache and deduplicates in-flight work', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-harness-')); roots.push(cwd)
    const key = cacheKey('reviewer', { diff: 'same' })
    await writeCache(cwd, 'reviewer', key, 'review-v1', { ok: true })
    const target = join(harnessDir(cwd), 'cache', 'reviewer', `${key}.json`)
    await writeFile(target, '{broken')
    expect((await readCache(cwd, 'reviewer', key, 'review-v1')).hit).toBe(false)
    let calls = 0
    const producer = async () => { calls += 1; await new Promise(resolve => setTimeout(resolve, 10)); return { ok: true } }
    const [first, second] = await Promise.all([cached(cwd, 'reviewer', key, 'review-v1', producer), cached(cwd, 'reviewer', key, 'review-v1', producer)])
    expect(calls).toBe(1)
    expect(first.value).toEqual(second.value)
    expect([first.cached, second.cached].sort()).toEqual([false, true])
    expect(await readFile(join(harnessDir(cwd), '.gitignore'), 'utf8')).toContain('cache/')
  })
})
