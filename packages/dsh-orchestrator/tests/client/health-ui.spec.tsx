// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HarnessDashboardStatus } from '../../src/wire.ts'
import type { HarnessClientApi } from '../../src/client/api.ts'
import { HarnessComposerControls, HarnessSettingsCard } from '../../src/client/HarnessHealthPanel.tsx'
import { cacheRate, dimensionLabel, healthLabel, healthTone, sparklinePoints } from '../../src/client/health-ui.ts'

afterEach(cleanup)

const dimensions = {
  instruction: { score: 96, samples: 2 }, context: { score: 94, samples: 2 }, reasoning: { score: 92, samples: 2 },
  structuredOutput: { score: 100, samples: 2 }, toolPlanning: { score: 90, samples: 2 }, completeness: { score: 95, samples: 2 },
}

const status: HarnessDashboardStatus = {
  initialized: true,
  modelKey: 'deepseek-official/deepseek-v4-flash',
  harness: {
    run: { version: 2, objective: 'test', phase: 'executing', createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z', orchestration: { mode: 'enhanced', stage: 'executing', cacheHits: 3, cacheMisses: 1 } },
    features: [], progress: '',
  },
  health: { modelKey: 'deepseek-official/deepseek-v4-flash', status: 'healthy', score: 95, baselineScore: 94, delta: 1, sampleCount: 12, dimensions, anomalies: [], trend: [{ timestamp: '2026-08-21T00:00:00.000Z', score: 95, dimension: 'instruction', source: 'probe' }], feedback: { normal: 1, degraded: 0 } },
}

function api(): HarnessClientApi {
  return {
    status: vi.fn(async () => status),
    mode: vi.fn(async () => status),
    probe: vi.fn(async () => ({ cached: false, summary: status.health })),
    feedback: vi.fn(async () => status),
  } as unknown as HarnessClientApi
}

function standardProps(current: string | undefined) {
  const sessions = { current, byId: current === undefined ? {} : { [current]: { displayTitle: 'Harness test' } } }
  return {
    useSessions: <T,>(selector: (value: typeof sessions) => T): T => selector(sessions),
    useWorkspaces: vi.fn(), useSession: vi.fn(), useProjection: vi.fn(),
  }
}

describe('health presentation', () => {
  it('maps warning states and cache/trend data deterministically', () => {
    expect(healthTone('degraded')).toBe('bad')
    expect(healthLabel('volatile')).toBe('波动')
    expect(dimensionLabel('toolPlanning')).toBe('工具规划')
    expect(cacheRate(status)).toBe(75)
    expect(sparklinePoints(status.health.trend)).toContain(',')
  })

  it('renders an explicit empty state when no session is selected', () => {
    render(<HarnessSettingsCard {...standardProps(undefined) as never} api={api()} />)
    expect(screen.getByText('Agent Harness')).toBeTruthy()
    expect(screen.getByText(/请先打开一个会话/)).toBeTruthy()
  })

  it('shows a clickable health summary from the composer control', async () => {
    render(<HarnessComposerControls {...standardProps('S1') as never} api={api()} sessionId={'S1' as never} session={{} as never} input={{} as never} />)
    await waitFor(() => { expect(screen.getByText(/模型 健康/)).toBeTruthy() })
    fireEvent.click(screen.getByText(/模型 健康/))
    expect(screen.getByText('deepseek-official/deepseek-v4-flash')).toBeTruthy()
    expect(screen.getByText((_text, element) => element?.textContent === '缓存：75% 命中')).toBeTruthy()
  })
})
