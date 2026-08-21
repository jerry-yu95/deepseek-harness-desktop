import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { harnessContextSync, initHarness, redactSecrets, retrieveMemory, sanitizeTrajectory, transitionHarness, updateFeature } from '../src/core.ts'

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
})
