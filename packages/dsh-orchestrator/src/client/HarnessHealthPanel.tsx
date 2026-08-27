import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useState } from 'react'
import type { HarnessClientApi } from './api.ts'
import { contextQualityScore, type ContextQualityMetrics, type ContextQualityScale } from '../context-quality.ts'
import { cacheRate, dimensionLabel, healthLabel, healthTone, sparklinePoints } from './health-ui.ts'
import { useHarnessStatus } from './useHarnessStatus.ts'
import styles from './harness.module.css'

export interface HarnessFace { api: HarnessClientApi }

type ControlProps = PropsRuntime<'conversation.input.left'> & HarnessFace
type OrchestrationMode = 'standard' | 'adaptive' | 'enhanced'

const modeOptions: Array<{ mode: OrchestrationMode; label: string; description: string }> = [
  { mode: 'standard', label: '标准编排', description: '保持官方对话路径，不额外启动规划或复核角色。' },
  { mode: 'adaptive', label: '自适应编排', description: '自动判断任务复杂度，选择最小够用的编排策略。' },
  { mode: 'enhanced', label: '增强编排', description: '显式启用 Planner、Reviewer 与 Evaluator 协作。' },
]

export function HarnessComposerControls(props: ControlProps) {
  const state = useHarnessStatus(props.api, props.sessionId)
  const [healthOpen, setHealthOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const mode = state.status?.harness?.run.orchestration.mode ?? 'standard'
  const title = props.useSessions(snapshot => snapshot.byId[props.sessionId]?.displayTitle)
  const health = state.status?.health
  const tone = health === undefined ? 'muted' : healthTone(health.status)
  return (
    <div className={styles.controls}>
      <button className={styles.toolbarControl} disabled={state.busy} onClick={() => { setModeOpen(value => !value); setHealthOpen(false) }} aria-expanded={modeOpen} aria-haspopup="menu" title="选择编排模式">
        <OrchestrationIcon />{modeLabel(mode)}编排 <ChevronIcon />
      </button>
      {modeOpen ? <div className={styles.modeMenu} role="menu" aria-label="选择编排模式">{modeOptions.map(option => <button key={option.mode} role="menuitemradio" aria-checked={mode === option.mode} onClick={() => { setModeOpen(false); void state.setMode(option.mode, title) }}><span><b>{option.label}</b><small>{option.description}</small></span><i>{mode === option.mode ? '当前' : ''}</i></button>)}</div> : null}
      <button className={`${styles.toolbarControl} ${styles[tone]}`} onClick={() => { setHealthOpen(value => !value); setModeOpen(false) }} aria-expanded={healthOpen} aria-haspopup="dialog" title="查看模型健康度">
        <HealthIcon />模型{health === undefined ? '检测中' : healthLabel(health.status)} <ChevronIcon />
      </button>
      {healthOpen ? <div className={styles.popover}><HealthDashboard state={state} compact /></div> : null}
    </div>
  )
}
type SettingsProps = PropsRuntime<'settings.plugin.item'> & HarnessFace

export function HarnessSettingsCard(props: SettingsProps) {
  const sessionId = props.useSessions(snapshot => snapshot.current)
  return (
    <section className={styles.settingsCard}>
      <header><div><h3>Agent Harness</h3><p>增强编排、缓存命中与模型健康度</p></div></header>
      {sessionId === undefined ? <div className={styles.empty}>请先打开一个会话，再查看当前模型与项目状态。</div> : <SettingsDashboard api={props.api} sessionId={sessionId} />}
    </section>
  )
}

function SettingsDashboard({ api, sessionId }: { api: HarnessClientApi; sessionId: string }) {
  const state = useHarnessStatus(api, sessionId)
  return <HealthDashboard state={state} />
}

type StatusState = ReturnType<typeof useHarnessStatus>

function HealthDashboard({ state, compact = false }: { state: StatusState; compact?: boolean }) {
  const [tab, setTab] = useState<'overview' | 'health' | 'context' | 'trace' | 'tokens'>('overview')
  if (state.loading && state.status === undefined) return <div className={styles.empty}>正在读取健康数据…</div>
  if (state.status === undefined) return <div className={styles.error}>暂时无法读取：{state.error ?? '未知错误'} <button onClick={() => { void state.refresh() }}>重试</button></div>
  const { health, harness, modelKey } = state.status
  const tone = healthTone(health.status)
  const mode = harness?.run.orchestration.mode ?? 'standard'
  const hitRate = cacheRate(state.status)
  return (
    <div className={`${styles.dashboard} ${compact ? styles.compact : ''}`}>
      <div className={styles.summary}>
        <div className={`${styles.score} ${styles[tone]}`}><strong>{health.sampleCount === 0 ? '—' : health.score}</strong><span>{healthLabel(health.status)}</span></div>
        <div className={styles.meta}><b>{modelKey}</b><span>样本 {health.sampleCount} · 基线 {health.baselineScore ?? '待建立'} · 变化 {health.delta === undefined ? '—' : `${health.delta > 0 ? '+' : ''}${health.delta}`}</span></div>
        <button className={styles.diagnosticAction} disabled={state.busy} onClick={() => { void state.probe(true) }}><HealthIcon />{state.busy ? '检测中…' : '立即检测'}</button>
      </div>
      {health.status === 'degraded' ? <div className={styles.alert}>检测到持续质量下降；仅提醒，不会自动切换模型。建议重试任务或运行一次健康检测。</div> : null}
      <div className={styles.orchestration}>
        <span>编排：<b>{modeLabel(mode)}</b></span>
        <span>阶段：{harness?.run.orchestration.stage ?? '未初始化'}</span>
        <span>缓存：{hitRate === undefined ? '暂无命中' : `${hitRate}% 命中`}</span>
        {(['standard', 'adaptive', 'enhanced'] as const).map(item => <button className={mode === item ? styles.activePeriod : ''} key={item} disabled={state.busy} onClick={() => { void state.setMode(item) }}>{modeLabel(item)}</button>)}
      </div>
      {mode === 'adaptive' && harness?.run.orchestration.latestDecision !== undefined ? <div className={styles.cacheBenefit}>策略 {harness.run.orchestration.latestDecision.strategy} · 置信度 {Math.round(harness.run.orchestration.latestDecision.confidence * 100)}% · 最多 {harness.run.orchestration.latestDecision.budget.maxAgents} Agent / {formatNumber(harness.run.orchestration.latestDecision.budget.maxTotalTokens)} Token</div> : null}
      {!compact ? <div className={styles.tabs} role="tablist">
        <button className={tab === 'overview' ? styles.activeTab : ''} onClick={() => { setTab('overview') }}>总览</button>
        <button className={tab === 'health' ? styles.activeTab : ''} onClick={() => { setTab('health') }}>模型健康</button>
        <button className={tab === 'context' ? styles.activeTab : ''} onClick={() => { setTab('context') }}>上下文质量</button>
        <button className={tab === 'trace' ? styles.activeTab : ''} onClick={() => { setTab('trace') }}>Agent 轨迹</button>
        <button className={tab === 'tokens' ? styles.activeTab : ''} onClick={() => { setTab('tokens') }}>Token 消耗</button>
      </div> : null}
      {!compact && tab === 'overview' ? <Overview state={state} /> : null}
      {!compact && tab === 'health' ? <>
        <div className={styles.dimensions}>{Object.entries(health.dimensions).map(([key, value]) => <div className={styles.dimension} key={key}><span>{dimensionLabel(key as keyof typeof health.dimensions)}</span><div><i style={{ width: `${value.score ?? 0}%` }} /></div><b>{value.score ?? '—'}</b></div>)}</div>
        <div className={styles.trend}><h4>近期趋势</h4>{health.trend.length === 0 ? <p>暂无数据，点击“立即检测”建立首批样本。</p> : <svg viewBox="0 0 240 54" role="img" aria-label="模型健康度趋势"><polyline points={sparklinePoints(health.trend)} /></svg>}</div>
        <div className={styles.feedback}><span>这次模型表现符合预期吗？</span><button disabled={state.busy} onClick={() => { void state.feedback('normal') }}>正常</button><button disabled={state.busy} onClick={() => { void state.feedback('degraded') }}>疑似降智</button><small>正常 {health.feedback.normal} · 降智 {health.feedback.degraded}</small></div>
        {health.anomalies.length > 0 ? <div className={styles.anomalies}><h4>近期异常</h4>{health.anomalies.slice(0, 5).map((item, index) => <p key={`${item.timestamp}-${index}`}><b>{dimensionLabel(item.dimension)}</b> {item.summary}</p>)}</div> : null}
      </> : null}
      {!compact && tab === 'context' ? <ContextQualityDashboard state={state} /> : null}
      {!compact && tab === 'trace' ? <TraceDashboard state={state} /> : null}
      {!compact && tab === 'tokens' ? <TokenDashboard state={state} /> : null}
      {state.error !== undefined ? <div className={styles.inlineError}>{state.error}</div> : null}
    </div>
  )
}

const contextMetricLabels: Array<[keyof ContextQualityMetrics, string]> = [
  ['criticalRecall', '关键事实'], ['exactLiteralRecall', '精确文本'], ['latestStateAccuracy', '最新状态'],
  ['constraintRecall', '约束保留'], ['pendingWorkRecall', '待办保留'], ['toolIntegrity', '工具配对'],
  ['sectionCompleteness', '结构完整'], ['staleLeakage', '过期信息泄漏'],
]

function ContextQualityDashboard({ state }: { state: StatusState }) {
  const [scale, setScale] = useState<ContextQualityScale>('32K')
  const summary = state.status!.contextQuality[scale]
  const latest = summary.latest
  const start = (): void => {
    const accepted = window.confirm(`将使用当前模型运行 ${scale} 长上下文检测，共调用 3 次，可能消耗较多 Token。是否继续？`)
    if (accepted) void state.runContextQuality(scale)
  }
  return <div className={styles.panel}>
    <div className={styles.contextNotice}>这是显式付费检测，不会自动运行。只保存脱敏评分、Token 用量和耗时，不保存测试提示词或模型原文。</div>
    <div className={styles.contextActions}>
      {(['32K', '128K'] as const).map(item => <button className={scale === item ? styles.activePeriod : ''} key={item} onClick={() => { setScale(item) }}>{item}</button>)}
      <button className={styles.contextRun} disabled={state.busy} onClick={start}>{state.busy ? '检测中…' : `运行 ${scale} 检测`}</button>
    </div>
    {latest === undefined ? <p className={styles.empty}>当前模型尚无 {scale} 实测记录。</p> : <>
      <div className={styles.contextHeadline}>
        <Metric label="综合质量" value={`${contextQualityScore(latest.metrics)}`} />
        <Metric label="通过率" value={`${summary.passRate ?? 0}%`} />
        <Metric label="历史运行" value={`${summary.totalRuns}`} />
        <Metric label="适配器窗口" value={formatNumber(latest.resolvedContextWindow)} />
      </div>
      <div className={styles.dimensions}>{contextMetricLabels.map(([key, label]) => <div className={styles.dimension} key={key}><span>{label}</span><div><i className={key === 'staleLeakage' ? styles.inverseMetric : ''} style={{ width: `${key === 'staleLeakage' ? 100 - latest.metrics[key] : latest.metrics[key]}%` }} /></div><b>{latest.metrics[key]}</b></div>)}</div>
      <div className={styles.contextMeta}>最近检测 {new Date(latest.timestamp).toLocaleString('zh-CN')} · {latest.sampleCount} 个样本 · 输入 {formatNumber(latest.usage.inputTokens)} · 输出 {formatNumber(latest.usage.outputTokens)} · 缓存读取 {formatNumber(latest.usage.cacheReadTokens)} · {formatDuration(latest.durationMs)}</div>
      <div className={styles.trend}><h4>历史趋势</h4><div className={styles.contextTrend}>{summary.trend.slice(-12).map(point => <span key={point.timestamp} title={`${new Date(point.timestamp).toLocaleString('zh-CN')} · ${point.score}`}><i style={{ height: `${Math.max(4, point.score)}%` }} /><small>{point.score}</small></span>)}</div></div>
    </>}
  </div>
}

function Overview({ state }: { state: StatusState }) {
  const data = state.status!.observability
  return <div className={styles.metricGrid}>
    <Metric label="总 Token" value={formatNumber(data.tokens.totalTokens)} />
    <Metric label="模型数量" value={String(data.models.length)} />
    <Metric label="缓存命中" value={data.cache.hitRate === undefined ? '—' : `${data.cache.hitRate}%`} />
    <Metric label="节省 Token" value={formatNumber(data.cache.savedTokens)} />
  </div>
}

function TraceDashboard({ state }: { state: StatusState }) {
  const data = state.status!.observability
  return <div className={styles.panel}>
    <div className={styles.cacheBenefit}>缓存 {data.cache.hits} 次命中 / {data.cache.misses} 次未命中 · 节省 {formatNumber(data.cache.savedTokens)} Token · {formatDuration(data.cache.savedMs)}</div>
    {data.traces.length === 0 ? <p className={styles.empty}>暂无增强编排轨迹。</p> : <div className={styles.traceList}>{data.traces.map((trace, index) => <div className={styles.traceRow} key={`${trace.runId}-${trace.stage}-${index}`}><b>{trace.stage}</b><span>{trace.status}</span><span>{formatDuration(trace.durationMs ?? 0)}</span><small>{trace.summary ?? trace.runId}</small></div>)}</div>}
  </div>
}

const periods = [['today', '今天'], ['7d', '最近 7 天'], ['30d', '最近 30 天'], ['month', '本月'], ['all', '全部']] as const
function TokenDashboard({ state }: { state: StatusState }) {
  const data = state.status!.observability
  return <div className={styles.panel}>
    <div className={styles.periods}>{periods.map(([period, label]) => <button className={state.period === period ? styles.activePeriod : ''} key={period} onClick={() => { state.setPeriod(period) }}>{label}</button>)}</div>
    <div className={styles.metricGrid}>
      <Metric label="全部模型总计" value={formatNumber(data.tokens.totalTokens)} />
      <Metric label="输入" value={formatNumber(data.tokens.uncachedInputTokens)} />
      <Metric label="输出" value={formatNumber(data.tokens.outputTokens)} />
      <Metric label="缓存读取" value={formatNumber(data.tokens.cacheReadTokens)} />
    </div>
    {data.estimatedEvents > 0 ? <p className={styles.estimateNote}>其中 {data.estimatedEvents} 条记录由本地估算；提供商精确 usage 会自动覆盖估算。</p> : null}
    <div className={styles.modelList}>{data.models.length === 0 ? <p className={styles.empty}>当前周期暂无 Token 记录。</p> : data.models.map(model => <div className={styles.modelRow} key={model.modelKey}><b>{model.modelKey}</b><span>{formatNumber(model.totalTokens)} Token</span><small>{model.calls} 次采样 · 输入 {formatNumber(model.uncachedInputTokens)} · 输出 {formatNumber(model.outputTokens)} · 缓存 {formatNumber(model.cacheReadTokens)}</small></div>)}</div>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div> }
function formatNumber(value: number): string { return new Intl.NumberFormat('zh-CN').format(value) }
function formatDuration(value: number): string { return value < 1000 ? `${value}ms` : `${Math.round(value / 100) / 10}s` }
function modeLabel(mode: OrchestrationMode): string { return mode === 'enhanced' ? '增强' : mode === 'adaptive' ? '自适应' : '标准' }

function OrchestrationIcon() { return <svg className={styles.lineIcon} viewBox="0 0 20 20" aria-hidden="true"><circle cx="5" cy="5" r="2" /><circle cx="15" cy="5" r="2" /><circle cx="10" cy="15" r="2" /><path d="M6.7 6.1 8.9 13M13.3 6.1 11.1 13M7 5h6" /></svg> }
function HealthIcon() { return <svg className={styles.lineIcon} viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 10h3l1.5-4 3 8 2-5 1.3 3h4.2" /><circle cx="10" cy="10" r="8" /></svg> }
function ChevronIcon() { return <svg className={styles.chevronIcon} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg> }
