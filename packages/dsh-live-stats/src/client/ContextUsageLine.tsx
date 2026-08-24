import { memo } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'

/** Props supplied by the session-scoped composer dock and locale renderer. */
export type ContextUsageLineProps =
  PropsRuntime<'conversation.composer.dock'>
  & PropsLocale<'live-stats'>

/** Compact a token count without hiding the scale users need to compare. */
export function formatContextTokens(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`
  if (value >= 1_000) return `${Math.round(value / 100) / 10}K`
  return String(Math.round(value))
}

const STYLE = {
  boxSizing: 'border-box',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '11px',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: '18px',
  margin: '0 auto',
  maxWidth: 'var(--dsh-chat-content-width)',
  overflow: 'hidden',
  padding: '0 var(--dsh-composer-side-clearance)',
  textAlign: 'center',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  width: '100%',
} as const

/**
 * Explicit numeric companion to the shipped context ring. It deliberately
 * disappears until the active adapter reports a real capacity, rather than
 * guessing from a model name or applying DeepSeek defaults to another route.
 */
export const ContextUsageLine = memo(function ContextUsageLine({ useProjection, t }: ContextUsageLineProps) {
  const pressure = useProjection('contextPressure')
  const used = pressure?.projectedTokens ?? pressure?.pressureTokens
  const contextWindow = pressure?.contextWindow
  if (
    used === undefined
    || contextWindow === undefined
    || !Number.isFinite(used)
    || !Number.isFinite(contextWindow)
    || used < 0
    || contextWindow <= 0
  ) return null

  const ratio = used / contextWindow
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)))
  const warning = ratio >= 0.8
    ? t('context.compactionZone')
    : ratio >= 0.65
      ? t('context.nearCompaction')
      : undefined
  const usage = t('context.usage', {
    used: formatContextTokens(used),
    window: formatContextTokens(contextWindow),
    percent,
  })

  return (
    <div
      aria-label={usage}
      data-context-warning={warning === undefined ? undefined : 'true'}
      style={{ ...STYLE, color: warning === undefined ? STYLE.color : 'var(--dsw-alias-state-warning, #b56a00)' }}
      title={t('context.hint')}
    >
      {usage}{warning === undefined ? '' : ` · ${warning}`}
    </div>
  )
})
