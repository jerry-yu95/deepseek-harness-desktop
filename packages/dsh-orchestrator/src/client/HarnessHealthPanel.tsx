import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useState } from 'react'
import type { HarnessClientApi } from './api.ts'
import { cacheRate, dimensionLabel, healthLabel, healthTone, sparklinePoints } from './health-ui.ts'
import { useHarnessStatus } from './useHarnessStatus.ts'
import styles from './harness.module.css'

export interface HarnessFace { api: HarnessClientApi }

type ControlProps = PropsRuntime<'conversation.input.left'> & HarnessFace

export function HarnessComposerControls(props: ControlProps) {
  const state = useHarnessStatus(props.api, props.sessionId)
  const [open, setOpen] = useState(false)
  const mode = state.status?.harness?.run.orchestration.mode ?? 'standard'
  const title = props.useSessions(snapshot => snapshot.byId[props.sessionId]?.displayTitle)
  const health = state.status?.health
  const tone = health === undefined ? 'muted' : healthTone(health.status)
  return (
    <div className={styles.controls}>
      <button className={styles.pill} disabled={state.busy} onClick={() => { void state.setMode(mode === 'enhanced' ? 'standard' : 'enhanced', title) }} title="切换 Agent 编排模式">
        <span className={mode === 'enhanced' ? styles.modeOn : styles.modeOff} />{mode === 'enhanced' ? '增强编排' : '标准编排'}
      </button>
      <button className={`${styles.pill} ${styles[tone]}`} onClick={() => { setOpen(value => !value) }} aria-expanded={open} title="查看模型健康度">
        <span className={styles.dot} />模型 {health === undefined ? '检测中' : healthLabel(health.status)}
      </button>
      {open ? <div className={styles.popover}><HealthDashboard state={state} compact /></div> : null}
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
        <button className={styles.primary} disabled={state.busy} onClick={() => { void state.probe() }}>{state.busy ? '检测中…' : '立即检测'}</button>
      </div>
      {health.status === 'degraded' ? <div className={styles.alert}>检测到持续质量下降；仅提醒，不会自动切换模型。建议重试任务或运行一次健康检测。</div> : null}
      <div className={styles.orchestration}>
        <span>编排：<b>{mode === 'enhanced' ? '增强' : '标准'}</b></span>
        <span>阶段：{harness?.run.orchestration.stage ?? '未初始化'}</span>
        <span>缓存：{hitRate === undefined ? '暂无命中' : `${hitRate}% 命中`}</span>
        <button disabled={state.busy} onClick={() => { void state.setMode(mode === 'enhanced' ? 'standard' : 'enhanced') }}>切换为{mode === 'enhanced' ? '标准' : '增强'}</button>
      </div>
      {!compact ? <>
        <div className={styles.dimensions}>{Object.entries(health.dimensions).map(([key, value]) => <div className={styles.dimension} key={key}><span>{dimensionLabel(key as keyof typeof health.dimensions)}</span><div><i style={{ width: `${value.score ?? 0}%` }} /></div><b>{value.score ?? '—'}</b></div>)}</div>
        <div className={styles.trend}><h4>近期趋势</h4>{health.trend.length === 0 ? <p>暂无数据，点击“立即检测”建立首批样本。</p> : <svg viewBox="0 0 240 54" role="img" aria-label="模型健康度趋势"><polyline points={sparklinePoints(health.trend)} /></svg>}</div>
        <div className={styles.feedback}><span>这次模型表现符合预期吗？</span><button disabled={state.busy} onClick={() => { void state.feedback('normal') }}>正常</button><button disabled={state.busy} onClick={() => { void state.feedback('degraded') }}>疑似降智</button><small>正常 {health.feedback.normal} · 降智 {health.feedback.degraded}</small></div>
        {health.anomalies.length > 0 ? <div className={styles.anomalies}><h4>近期异常</h4>{health.anomalies.slice(0, 5).map((item, index) => <p key={`${item.timestamp}-${index}`}><b>{dimensionLabel(item.dimension)}</b> {item.summary}</p>)}</div> : null}
      </> : null}
      {state.error !== undefined ? <div className={styles.inlineError}>{state.error}</div> : null}
    </div>
  )
}
