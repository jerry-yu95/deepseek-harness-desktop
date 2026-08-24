/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { UseProjection } from '@deepseek-ai/dsh-client-runtime/client'
import { ContextUsageLine, formatContextTokens, type ContextUsageLineProps } from '../src/client/ContextUsageLine.tsx'

afterEach(cleanup)

const copy: Record<string, string> = {
  'context.usage': '上下文约 {used} / {window} · {percent}%',
  'context.nearCompaction': '接近自动压缩区间',
  'context.compactionZone': '已进入自动压缩区间',
  'context.hint': '提示',
}

function t(key: string, params?: Record<string, unknown>): string {
  return Object.entries(params ?? {}).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
    copy[key] ?? key,
  )
}

function props(value: unknown): ContextUsageLineProps {
  const useProjection = ((key: string): unknown => key === 'contextPressure' ? value : undefined) as UseProjection
  return {
    useProjection,
    t,
    session: {},
    input: {},
    sessionId: '',
    useSession: () => undefined,
    useSessions: () => undefined,
    useWorkspaces: () => undefined,
  } as unknown as ContextUsageLineProps
}

describe('context usage composer line', () => {
  it('formats compact token scales', () => {
    expect(formatContextTokens(999)).toBe('999')
    expect(formatContextTokens(47_400)).toBe('47.4K')
    expect(formatContextTokens(1_000_000)).toBe('1M')
  })

  it('does not guess a capacity when the adapter omitted it', () => {
    const view = render(<ContextUsageLine {...props({ projectedTokens: 10_000 })} />)
    expect(view.container.textContent).toBe('')
  })

  it('shows projected occupancy and compaction ranges', () => {
    const view = render(<ContextUsageLine {...props({ projectedTokens: 474_000, contextWindow: 1_000_000 })} />)
    expect(view.container.textContent).toBe('上下文约 474K / 1M · 47%')

    view.rerender(<ContextUsageLine {...props({ projectedTokens: 700_000, contextWindow: 1_000_000 })} />)
    expect(view.container.textContent).toContain('接近自动压缩区间')

    view.rerender(<ContextUsageLine {...props({ pressureTokens: 850_000, contextWindow: 1_000_000 })} />)
    expect(view.container.textContent).toContain('已进入自动压缩区间')
  })
})
