import { defineTool } from '@deepseek-ai/dsh-tools';
import { assessTask } from "./adaptive.js";
import { appendProgress, harnessContextSync, initHarness, loadHarness, setOrchestrationMode, transitionHarness, updateFeature, updateOrchestration } from "./core.js";
import { runOrchestrationRole } from "./orchestration.js";
import { getModelHealth, recordHealthFeedback, recordHealthSignals, runModelHealthProbe } from "./model-health.js";
import { aggregateObservability, recordTokenSnapshot } from "./observability.js";
import { aggregateContextQuality } from "./context-quality.js";
import { runContextQualityProbe } from "./context-quality-probe.js";
import { HARNESS_RPC_CHANNEL } from "./wire.js";
export const name = 'harness-orchestrator';
export const inject = ['systemPrompt', 'tools', 'connection', 'agents', 'commands', 'sessionProjections', 'llm', 'tokenMeter'];
export function apply(ctx) {
    ctx.effect(() => ctx.commands.register({
        name: 'harness',
        description: '查看或切换 Agent Harness 编排模式',
        input: { hint: 'on | adaptive | off | status | route <task> | run planner|reviewer|evaluator [evidence]' },
        recordInput: false,
        handler: executeHarnessCommand,
    }), 'harness-orchestrator: slash command');
    ctx.effect(() => ctx.connection.rpc.handle(HARNESS_RPC_CHANNEL, async (endpoint, payload, signal) => {
        try {
            if (endpoint === 'status') {
                const request = parseSessionRequest(payload);
                return { ok: true, value: await dashboardStatus(ctx, request.sessionId, request.period) };
            }
            if (endpoint === 'mode') {
                const request = parseModeRequest(payload);
                const agent = requireLiveAgent(ctx, request.sessionId);
                const cwd = requireWorkspace(agent.session.header.cwd);
                let snapshot = await loadHarness(cwd);
                if (snapshot === undefined) {
                    snapshot = await initHarness(cwd, request.objective?.trim() || `Enhanced orchestration for ${cwd.split('/').filter(Boolean).at(-1) ?? 'workspace'}`);
                }
                await setOrchestrationMode(cwd, request.mode);
                return { ok: true, value: { status: await dashboardStatus(ctx, request.sessionId) } };
            }
            if (endpoint === 'probe') {
                const request = parseProbeRequest(payload);
                const agent = requireLiveAgent(ctx, request.sessionId);
                const cwd = requireWorkspace(agent.session.header.cwd);
                const modelKey = currentModelKey(agent);
                return { ok: true, value: await runModelHealthProbe({ cwd, modelKey, parent: agent, signal, workflowEngine: agent.ctx.get('workflowEngine'), llm: ctx.llm, ...(request.bypassCache === undefined ? {} : { bypassCache: request.bypassCache }) }) };
            }
            if (endpoint === 'context-quality') {
                const request = parseContextQualityRequest(payload);
                const agent = requireLiveAgent(ctx, request.sessionId);
                const cwd = requireWorkspace(agent.session.header.cwd);
                const route = requireCurrentModelRoute(agent);
                return { ok: true, value: await runContextQualityProbe({ cwd, modelKey: `${route.provider}/${route.model}`, provider: route.provider, model: route.model, scale: request.scale, confirmed: request.confirmed, llm: ctx.llm, tokenMeter: ctx.tokenMeter, signal }) };
            }
            if (endpoint === 'route') {
                const request = parseRouteRequest(payload);
                const agent = requireLiveAgent(ctx, request.sessionId);
                const cwd = requireWorkspace(agent.session.header.cwd);
                return { ok: true, value: await routeAdaptiveTask({ cwd, objective: request.objective, parent: agent, signal, workflowEngine: requireAgentWorkflowEngine(agent), bypassCache: request.bypassCache }) };
            }
            if (endpoint === 'feedback') {
                const request = parseFeedbackRequest(payload);
                const agent = requireLiveAgent(ctx, request.sessionId);
                const cwd = requireWorkspace(agent.session.header.cwd);
                await recordHealthFeedback(cwd, { timestamp: new Date().toISOString(), modelKey: currentModelKey(agent), verdict: request.verdict, ...(request.note === undefined ? {} : { note: request.note }) });
                return { ok: true, value: { status: await dashboardStatus(ctx, request.sessionId) } };
            }
            return { ok: true, value: { error: 'unknown-endpoint' } };
        }
        catch (error) {
            return { ok: true, value: { error: safeError(error) } };
        }
    }, { authority: 'loopback' }), 'harness-orchestrator: dashboard rpc');
    ctx.systemPrompt.context({
        name: 'harness:project-state', order: 80,
        text: assemble => assemble.agent?.session.header.cwd === undefined ? '' : harnessContextSync(assemble.agent.session.header.cwd),
    });
    ctx.tools.register(defineTool({
        name: 'harness_state',
        description: 'Manage the project-local Harness objective, acceptance ledger, progress checkpoints, and validated phase transitions.',
        parameters: {
            action: { type: 'string', required: true, enum: ['init', 'status', 'transition', 'feature', 'checkpoint'] },
            objective: { type: 'string' }, features: { type: 'array', items: { type: 'string' } }, phase: { type: 'string', enum: ['planning', 'executing', 'evaluating', 'repairing', 'complete', 'blocked'] },
            featureId: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'passed', 'failed'] }, evidence: { type: 'string' }, note: { type: 'string' },
        },
        output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        },
        async execute(args, exec) {
            const cwd = exec.agent?.session.header.cwd;
            if (cwd === undefined)
                throw new Error('harness_state requires an agent workspace');
            switch (args.action) {
                case 'init': return summarize(await initHarness(cwd, args.objective ?? '', args.features ?? []));
                case 'status': {
                    const value = await loadHarness(cwd);
                    return value === undefined ? { initialized: false } : summarize(value);
                }
                case 'transition':
                    if (args.phase === undefined)
                        throw new Error('phase-required');
                    return summarize(await transitionHarness(cwd, args.phase));
                case 'feature':
                    if (args.featureId === undefined || args.status === undefined)
                        throw new Error('featureId-and-status-required');
                    return summarize(await updateFeature(cwd, args.featureId, args.status, args.evidence));
                case 'checkpoint':
                    if (args.note === undefined)
                        throw new Error('note-required');
                    return summarize(await appendProgress(cwd, args.note));
            }
        },
    }));
    ctx.tools.register(defineTool({
        name: 'harness_orchestrate',
        description: 'Explicitly enable/disable Enhanced orchestration or run its structured Planner, Grounding Reviewer, and Completion Evaluator through the official DSH workflow engine. Never use implicitly in Standard mode.',
        parameters: {
            action: { type: 'string', required: true, enum: ['on', 'adaptive', 'off', 'status', 'route', 'run'] },
            role: { type: 'string', enum: ['planner', 'reviewer', 'evaluator'] },
            objective: { type: 'string', description: 'Current bounded task objective for adaptive routing.' },
            evidence: { type: 'string', description: 'Bounded implementation/test evidence for reviewer or evaluator. Do not include secrets or hidden reasoning.' },
            bypassCache: { type: 'boolean', description: 'Ignore an existing role cache entry for this run.' },
        },
        output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        },
        async execute(args, exec) {
            const agent = exec.agent;
            const cwd = agent?.session.header.cwd;
            if (cwd === undefined || agent === undefined)
                throw new Error('harness_orchestrate requires an agent workspace');
            if (args.action === 'on')
                return summarize(await setOrchestrationMode(cwd, 'enhanced'));
            if (args.action === 'adaptive')
                return summarize(await setOrchestrationMode(cwd, 'adaptive'));
            if (args.action === 'off')
                return summarize(await setOrchestrationMode(cwd, 'standard'));
            if (args.action === 'status') {
                const snapshot = await loadHarness(cwd);
                return snapshot === undefined ? { initialized: false } : summarize(snapshot);
            }
            if (args.action === 'route') {
                return await routeAdaptiveTask({ cwd, objective: args.objective ?? '', parent: agent, signal: exec.signal, workflowEngine: requireAgentWorkflowEngine(agent), bypassCache: args.bypassCache });
            }
            if (args.role === undefined)
                throw new Error('role-required');
            return await runOrchestrationRole({
                cwd,
                role: args.role,
                parent: agent,
                signal: exec.signal,
                workflowEngine: requireAgentWorkflowEngine(agent),
                ...(args.evidence === undefined ? {} : { evidence: args.evidence }),
                ...(args.bypassCache === undefined ? {} : { bypassCache: args.bypassCache }),
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'model_health',
        description: 'Inspect model health, run an explicit isolated diagnostic, record a bounded passive quality signal, or record user feedback. This warns about sustained regression and never switches models.',
        parameters: {
            action: { type: 'string', required: true, enum: ['status', 'probe', 'record', 'feedback'] },
            modelKey: { type: 'string', description: 'Stable provider/model route identity. Defaults to the current agent provider/model.' },
            dimension: { type: 'string', enum: ['instruction', 'context', 'reasoning', 'structuredOutput', 'toolPlanning', 'completeness'] },
            score: { type: 'number' }, anomaly: { type: 'string' }, verdict: { type: 'string', enum: ['normal', 'degraded'] }, note: { type: 'string' }, bypassCache: { type: 'boolean' },
        },
        output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
        async execute(args, exec) {
            const agent = exec.agent;
            const cwd = agent?.session.header.cwd;
            if (cwd === undefined || agent === undefined)
                throw new Error('model_health requires an agent workspace');
            const modelKey = args.modelKey?.trim() || `${agent.options.provider ?? 'default'}/${agent.options.model ?? 'default'}`;
            if (args.action === 'status')
                return await getModelHealth(cwd, modelKey);
            if (args.action === 'probe')
                return await runModelHealthProbe({ cwd, modelKey, parent: agent, signal: exec.signal, workflowEngine: agent.ctx.get('workflowEngine'), llm: ctx.llm, ...(args.bypassCache === undefined ? {} : { bypassCache: args.bypassCache }) });
            if (args.action === 'feedback') {
                if (args.verdict === undefined)
                    throw new Error('verdict-required');
                return await recordHealthFeedback(cwd, { timestamp: new Date().toISOString(), modelKey, verdict: args.verdict, ...(args.note === undefined ? {} : { note: args.note }) });
            }
            if (args.dimension === undefined || args.score === undefined)
                throw new Error('dimension-and-score-required');
            return await recordHealthSignals(cwd, [{ timestamp: new Date().toISOString(), modelKey, dimension: args.dimension, score: args.score, source: 'passive', ...(args.anomaly === undefined ? {} : { anomaly: args.anomaly }) }]);
        },
    }));
}
/** Direct UI fallback for environments where the enhanced-mode control is unavailable. */
export async function executeHarnessCommand(invocation) {
    const cwd = invocation.agent.session.header.cwd;
    if (cwd === undefined || cwd.trim() === '')
        return { kind: 'error', text: '当前会话没有工作区。' };
    const input = invocation.rawInput.trim();
    const [action = 'status', role, ...evidenceParts] = input.split(/\s+/);
    if (action === 'on' || action === 'adaptive' || action === 'off') {
        let snapshot = await loadHarness(cwd);
        if (snapshot === undefined)
            snapshot = await initHarness(cwd, `Enhanced orchestration for ${cwd.split('/').filter(Boolean).at(-1) ?? 'workspace'}`);
        snapshot = await setOrchestrationMode(cwd, action === 'on' ? 'enhanced' : action === 'adaptive' ? 'adaptive' : 'standard');
        return { kind: 'success', text: `Agent Harness 已切换为${modeLabel(snapshot.run.orchestration.mode)}编排。` };
    }
    if (action === 'status') {
        const snapshot = await loadHarness(cwd);
        if (snapshot === undefined)
            return { kind: 'success', text: 'Agent Harness 尚未初始化；使用 /harness on 开启增强编排。' };
        const { orchestration } = snapshot.run;
        const total = orchestration.cacheHits + orchestration.cacheMisses;
        const rate = total === 0 ? '暂无' : `${Math.round(orchestration.cacheHits / total * 100)}%`;
        return { kind: 'success', text: `Agent Harness：${modeLabel(orchestration.mode)}编排；阶段 ${orchestration.stage}；缓存命中率 ${rate}。` };
    }
    if (action === 'route') {
        const objective = [role, ...evidenceParts].filter(Boolean).join(' ');
        const outcome = await routeAdaptiveTask({ cwd, objective, parent: invocation.agent, signal: invocation.signal, workflowEngine: requireAgentWorkflowEngine(invocation.agent) });
        return { kind: 'success', text: `自适应策略：${outcome.decision.strategy}（置信度 ${Math.round(outcome.decision.confidence * 100)}%）；${outcome.planner?.ok === false ? 'Planner 失败，已回退标准执行。' : outcome.decision.reasons.join('；')}` };
    }
    if (action === 'run') {
        if (role !== 'planner' && role !== 'reviewer' && role !== 'evaluator') {
            return { kind: 'error', text: '用法：/harness run planner|reviewer|evaluator [evidence]' };
        }
        const snapshot = await loadHarness(cwd);
        if (snapshot?.run.orchestration.mode !== 'enhanced')
            return { kind: 'error', text: '请先使用 /harness on 开启增强编排。' };
        const outcome = await runOrchestrationRole({
            cwd,
            role,
            parent: invocation.agent,
            signal: invocation.signal,
            workflowEngine: requireAgentWorkflowEngine(invocation.agent),
            ...(evidenceParts.length === 0 ? {} : { evidence: evidenceParts.join(' ') }),
        });
        return outcome.ok
            ? { kind: 'success', text: `${role} 已完成${outcome.cached ? '（缓存命中）' : ''}。` }
            : { kind: 'error', text: outcome.error ?? `${role} 运行失败。` };
    }
    return { kind: 'error', text: '用法：/harness on | adaptive | off | status | route <task> | run planner|reviewer|evaluator [evidence]' };
}
async function routeAdaptiveTask(input) {
    const snapshot = await loadHarness(input.cwd);
    if (snapshot === undefined)
        throw new Error('harness-not-initialized');
    if (snapshot.run.orchestration.mode !== 'adaptive')
        throw new Error('adaptive-orchestration-not-enabled');
    const decision = assessTask(input.objective);
    await updateOrchestration(input.cwd, { latestDecision: decision, stage: decision.strategy === 'direct' ? 'executing' : 'planning', lastFailure: undefined });
    if (decision.strategy === 'direct')
        return { decision };
    const planner = await runOrchestrationRole({ cwd: input.cwd, role: 'planner', parent: input.parent, signal: input.signal, workflowEngine: input.workflowEngine, objective: decision.objective, ...(input.bypassCache === undefined ? {} : { bypassCache: input.bypassCache }) });
    return planner.ok ? { decision, planner } : { decision, planner, fallback: 'standard' };
}
function modeLabel(mode) { return mode === 'enhanced' ? '增强' : mode === 'adaptive' ? '自适应' : '标准'; }
function summarize(snapshot) {
    return {
        initialized: true,
        objective: snapshot.run.objective,
        phase: snapshot.run.phase,
        passed: snapshot.features.filter(item => item.status === 'passed').length,
        total: snapshot.features.length,
        orchestration: { ...snapshot.run.orchestration },
        features: snapshot.features.map(item => ({
            id: item.id,
            title: item.title,
            acceptance: item.acceptance,
            status: item.status,
            evidence: [...item.evidence],
        })),
    };
}
export * from "./core.js";
export * from "./adaptive.js";
export * from "./orchestration.js";
export * from "./model-health.js";
export * from "./observability.js";
export * from "./context-quality.js";
export * from "./context-quality-probe.js";
export * from "./wire.js";
function requireLiveAgent(ctx, sessionId) {
    const agent = ctx.agents.get(sessionId);
    if (agent === undefined)
        throw new Error('session-not-live');
    return agent;
}
function requireWorkspace(cwd) {
    if (cwd === undefined || cwd.trim() === '')
        throw new Error('workspace-unavailable');
    return cwd;
}
function currentModelKey(agent) {
    return `${agent.options.provider ?? 'default'}/${agent.options.model ?? 'default'}`;
}
function requireCurrentModelRoute(agent) {
    const provider = agent.options.provider;
    const model = agent.options.model;
    if (provider === undefined || model === undefined)
        throw new Error('context-quality-route-unavailable');
    return { provider, model };
}
function requireAgentWorkflowEngine(agent) {
    const workflowEngine = agent.ctx.get('workflowEngine');
    if (workflowEngine === undefined)
        throw new Error('workflow-engine-unavailable-for-agent');
    return workflowEngine;
}
async function dashboardStatus(ctx, sessionId, period = '7d') {
    const agent = requireLiveAgent(ctx, sessionId);
    const cwd = requireWorkspace(agent.session.header.cwd);
    const modelKey = currentModelKey(agent);
    await captureTokenSnapshot(ctx, agent, cwd, modelKey).catch(() => undefined);
    const [harness, health, observability, quality32K, quality128K] = await Promise.all([loadHarness(cwd), getModelHealth(cwd, modelKey), aggregateObservability(cwd, { period }), aggregateContextQuality(cwd, { modelKey, scale: '32K' }), aggregateContextQuality(cwd, { modelKey, scale: '128K' })]);
    return { initialized: harness !== undefined, modelKey, ...(harness === undefined ? {} : { harness }), health, observability, contextQuality: { '32K': quality32K, '128K': quality128K } };
}
async function captureTokenSnapshot(ctx, agent, cwd, modelKey) {
    const snapshot = ctx.sessionProjections.snapshot(agent.session);
    const usage = snapshot.values?.liveTokenUsage;
    if (usage === undefined)
        return;
    await recordTokenSnapshot({ cwd, sessionId: String(agent.session.id), modelKey, project: cwd.split('/').filter(Boolean).at(-1) ?? 'workspace', timestamp: new Date().toISOString(), estimated: usage.estimated === true, usage });
}
function parseSessionRequest(payload) {
    if (!isRecord(payload) || typeof payload.sessionId !== 'string' || payload.sessionId === '')
        throw new Error('sessionId-required');
    const period = typeof payload.period === 'string' && ['today', '7d', '30d', 'month', 'all'].includes(payload.period) ? payload.period : undefined;
    return { sessionId: payload.sessionId, ...(period === undefined ? {} : { period }) };
}
function parseModeRequest(payload) {
    const request = parseSessionRequest(payload);
    if (!isRecord(payload) || (payload.mode !== 'standard' && payload.mode !== 'enhanced' && payload.mode !== 'adaptive'))
        throw new Error('mode-required');
    return { ...request, mode: payload.mode, ...(typeof payload.objective === 'string' ? { objective: payload.objective } : {}) };
}
function parseRouteRequest(payload) {
    const request = parseSessionRequest(payload);
    if (!isRecord(payload) || typeof payload.objective !== 'string' || payload.objective.trim() === '')
        throw new Error('adaptive-objective-required');
    return { ...request, objective: payload.objective, ...(typeof payload.bypassCache === 'boolean' ? { bypassCache: payload.bypassCache } : {}) };
}
function parseProbeRequest(payload) {
    const request = parseSessionRequest(payload);
    return { ...request, ...(isRecord(payload) && typeof payload.bypassCache === 'boolean' ? { bypassCache: payload.bypassCache } : {}) };
}
function parseContextQualityRequest(payload) {
    const request = parseSessionRequest(payload);
    if (!isRecord(payload) || (payload.scale !== '32K' && payload.scale !== '128K'))
        throw new Error('context-quality-scale-required');
    if (payload.confirmed !== true)
        throw new Error('context-quality-confirmation-required');
    return { ...request, scale: payload.scale, confirmed: true };
}
function parseFeedbackRequest(payload) {
    const request = parseSessionRequest(payload);
    if (!isRecord(payload) || (payload.verdict !== 'normal' && payload.verdict !== 'degraded'))
        throw new Error('verdict-required');
    return { ...request, verdict: payload.verdict, ...(typeof payload.note === 'string' ? { note: payload.note } : {}) };
}
function isRecord(value) { return typeof value === 'object' && value !== null; }
function safeError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'workflow-engine-unavailable-for-agent')
        return '当前会话没有 Workflow Engine；复杂编排需要使用标准、PTC 或创造模式。';
    if (message === 'model-health-probe-unavailable')
        return '当前模型路由不支持独立健康检测，请先完成几轮对话以积累被动样本。';
    if (message === 'model-health-probe-format-unreadable' || message === 'invalid-model-health-probe-result')
        return '模型已响应，但检测格式不完整。本次结果不会计入健康评分，请稍后重试。';
    if (message === 'context-quality-confirmation-required')
        return '运行长上下文检测前需要明确确认，因为它会连续调用当前模型 3 次并消耗较多 Token。';
    if (message === 'context-quality-route-unavailable')
        return '当前会话尚未解析出明确的模型路由，无法运行长上下文检测。';
    if (message === 'context-quality-capacity-unknown')
        return '当前模型适配器未声明上下文窗口容量；为避免超额调用，本次检测已停止。';
    if (message === 'context-quality-capacity-insufficient')
        return '当前模型适配器声明的上下文窗口小于所选检测规模；本次检测未调用模型。';
    if (message === 'context-quality-aborted')
        return '长上下文检测已取消，本次结果不会写入历史。';
    if (message === 'context-quality-result-unreadable')
        return '模型已响应，但长上下文检测结果格式不完整；本次结果不会写入历史。';
    return redactError(message);
}
function redactError(message) { return message.replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]').slice(0, 500); }
