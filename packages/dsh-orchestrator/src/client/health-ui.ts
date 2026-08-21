import type { HealthDimension, HealthStatus, ModelHealthSummary } from '../model-health.ts'

export type HealthTone = 'good' | 'warn' | 'bad' | 'muted'

export function healthTone(status: HealthStatus): HealthTone {
  if (status === 'healthy') return 'good'
  if (status === 'degraded') return 'bad'
  if (status === 'volatile') return 'warn'
  return 'muted'
}
export function healthLabel(status: HealthStatus): string {
  return ({ healthy: '健康', volatile: '波动', degraded: '疑似降智', 'insufficient-data': '采样中' })[status]
}

export function dimensionLabel(dimension: HealthDimension): string {
  return ({ instruction: '指令遵循', context: '上下文保持', reasoning: '推理稳定', structuredOutput: '结构化输出', toolPlanning: '工具规划', completeness: '回答完整度' })[dimension]
}

export function cacheRate(summary: HarnessDashboardLike): number | undefined {
  const cache = summary.harness?.run.orchestration
  if (cache === undefined) return undefined
  const total = cache.cacheHits + cache.cacheMisses
  return total === 0 ? undefined : Math.round(cache.cacheHits / total * 100)
}

type HarnessDashboardLike = Pick<import('../wire.ts').HarnessDashboardStatus, 'harness'>

export function sparklinePoints(trend: ModelHealthSummary['trend'], width = 240, height = 54): string {
  if (trend.length === 0) return ''
  if (trend.length === 1) return `${width / 2},${height - trend[0]!.score / 100 * height}`
  return trend.map((item, index) => `${index / (trend.length - 1) * width},${height - item.score / 100 * height}`).join(' ')
}
