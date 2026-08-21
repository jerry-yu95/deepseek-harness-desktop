import { createHash } from 'node:crypto';
const DEPTH = /分析|设计|架构|重构|排查|研究|规划|迁移|实现|修复|build|implement|design|debug|migrate|refactor/gi;
const HORIZON = /然后|接着|最后|阶段|步骤|完成后|发布|部署|迭代|测试后|then|after|finally|phase|deploy|release/gi;
const BREADTH = /前端|后端|桌面|移动端|数据库|接口|文档|测试|windows|macos|linux|android|ios|frontend|backend|database|api/gi;
const PARALLEL = /并行|分别|同时|各自|多平台|parallel|concurrent|independent/gi;
const VERIFY = /验证|测试|验收|检查|审查|回归|基准|对比|verify|test|review|benchmark|acceptance/gi;
const RISK = /安全|鉴权|权限|凭证|api key|密钥|支付|删除|生产|发布|升级|回滚|隐私|security|auth|credential|payment|delete|production|rollback/gi;
export function assessTask(rawObjective) {
    const objective = normalizeObjective(rawObjective);
    if (objective === '')
        throw new Error('adaptive-objective-required');
    const dimensions = {
        depth: score(objective, DEPTH, objective.length >= 120 ? 1 : 0),
        horizon: score(objective, HORIZON),
        breadth: scoreUnique(objective, BREADTH),
        parallelism: score(objective, PARALLEL),
        verification: score(objective, VERIFY),
        risk: score(objective, RISK),
    };
    const total = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
    const artifacts = independentArtifacts(objective);
    const strategy = artifacts.length >= 2 && dimensions.parallelism >= 1
        ? 'parallel-dag'
        : dimensions.risk >= 2 || (dimensions.verification >= 2 && total >= 6)
            ? 'plan-review'
            : total >= 4
                ? 'plan-execute'
                : 'direct';
    const budget = budgetFor(strategy, artifacts.length);
    const reasons = routingReasons(strategy, dimensions, artifacts.length);
    const dag = buildDag(strategy, objective, artifacts);
    validateAdaptiveDag(dag, budget);
    return {
        version: 1,
        id: createHash('sha256').update(JSON.stringify({ objective, strategy, dimensions })).digest('hex').slice(0, 16),
        objective,
        strategy,
        confidence: confidenceFor(total, strategy, artifacts.length),
        reasons,
        dimensions,
        budget,
        dag,
        fallback: 'standard',
    };
}
export function validateAdaptiveDag(dag, budget) {
    if (dag.version !== 1 || !Array.isArray(dag.nodes) || dag.nodes.length === 0)
        throw new Error('invalid-adaptive-dag');
    const ids = new Set();
    for (const node of dag.nodes) {
        if (!/^[a-z][a-z0-9-]{0,39}$/.test(node.id) || ids.has(node.id) || node.title.trim() === '' || node.acceptance.trim() === '' || !Array.isArray(node.dependsOn))
            throw new Error('invalid-adaptive-node');
        ids.add(node.id);
    }
    for (const node of dag.nodes)
        if (node.dependsOn.some(id => !ids.has(id)))
            throw new Error('adaptive-dag-unknown-dependency');
    const visiting = new Set();
    const visited = new Set();
    const byId = new Map(dag.nodes.map(node => [node.id, node]));
    const visit = (id) => {
        if (visiting.has(id))
            throw new Error('adaptive-dag-cycle');
        if (visited.has(id))
            return;
        visiting.add(id);
        for (const dependency of byId.get(id)?.dependsOn ?? [])
            visit(dependency);
        visiting.delete(id);
        visited.add(id);
    };
    for (const id of ids)
        visit(id);
    const largestParallelGroup = Math.max(1, ...Object.values(Object.groupBy(dag.nodes.filter(node => node.parallelGroup !== undefined), node => node.parallelGroup)).map(nodes => nodes?.length ?? 0));
    if (largestParallelGroup > budget.maxAgents)
        throw new Error('adaptive-dag-agent-budget-exceeded');
    if (budget.maxAgents < 1 || budget.maxAgents > 4 || budget.maxTotalTokens < 1 || budget.maxTotalTokens > 160_000 || budget.maxWallTimeMs < 1 || budget.maxWallTimeMs > 30 * 60_000 || budget.maxRetries < 0 || budget.maxRetries > 2)
        throw new Error('invalid-adaptive-budget');
}
function normalizeObjective(value) { return value.replace(/\s+/g, ' ').trim().slice(0, 4000); }
function matches(value, pattern) { pattern.lastIndex = 0; return value.match(pattern) ?? []; }
function score(value, pattern, bonus = 0) { return Math.min(3, matches(value, pattern).length + bonus); }
function scoreUnique(value, pattern) { return Math.min(3, new Set(matches(value, pattern).map(item => item.toLowerCase())).size); }
function independentArtifacts(objective) {
    const candidates = [
        [/windows/i, 'Windows'], [/macos?\s*(?:intel|x64)/i, 'macOS Intel'], [/macos?\s*(?:arm|apple silicon)/i, 'macOS ARM'], [/linux/i, 'Linux'],
        [/前端|frontend/i, '前端'], [/后端|backend/i, '后端'], [/文档|documentation/i, '文档'], [/测试|test suite/i, '测试'],
    ];
    return candidates.filter(([pattern]) => pattern.test(objective)).map(([, label]) => label).slice(0, 3);
}
function budgetFor(strategy, artifactCount) {
    if (strategy === 'direct')
        return { maxAgents: 1, maxTotalTokens: 16_000, maxWallTimeMs: 5 * 60_000, maxRetries: 0 };
    if (strategy === 'plan-execute')
        return { maxAgents: 1, maxTotalTokens: 48_000, maxWallTimeMs: 10 * 60_000, maxRetries: 1 };
    if (strategy === 'plan-review')
        return { maxAgents: 2, maxTotalTokens: 80_000, maxWallTimeMs: 15 * 60_000, maxRetries: 1 };
    return { maxAgents: Math.min(4, Math.max(2, artifactCount)), maxTotalTokens: 120_000, maxWallTimeMs: 20 * 60_000, maxRetries: 1 };
}
function buildDag(strategy, objective, artifacts) {
    if (strategy === 'direct')
        return { version: 1, nodes: [{ id: 'execute', title: objective.slice(0, 120), role: 'primary', dependsOn: [], acceptance: '直接回答或完成用户请求，并报告可验证结果' }] };
    const planner = { id: 'plan', title: '生成结构化计划与验收条件', role: 'planner', dependsOn: [], acceptance: '计划包含任务边界、依赖和验收条件' };
    if (strategy === 'plan-execute')
        return { version: 1, nodes: [planner, { id: 'execute', title: '按计划执行', role: 'primary', dependsOn: ['plan'], acceptance: '所有计划项均有结果或明确阻塞证据' }] };
    if (strategy === 'plan-review')
        return { version: 1, nodes: [planner, { id: 'execute', title: '按计划执行', role: 'primary', dependsOn: ['plan'], acceptance: '实现完成并生成测试证据' }, { id: 'verify', title: '独立审查与验收', role: 'verifier', dependsOn: ['execute'], acceptance: '验证安全、正确性、回归和回滚条件' }] };
    const workers = artifacts.map((artifact, index) => ({ id: `worker-${index + 1}`, title: `完成${artifact}子任务`, role: 'worker', dependsOn: ['plan'], acceptance: `${artifact}产物通过对应测试`, parallelGroup: 'workers' }));
    return { version: 1, nodes: [planner, ...workers, { id: 'synthesize', title: '汇总并检查跨产物一致性', role: 'synthesizer', dependsOn: workers.map(node => node.id), acceptance: '所有子任务结果已汇总且冲突已解决' }, { id: 'verify', title: '独立最终验收', role: 'verifier', dependsOn: ['synthesize'], acceptance: '整体质量、预算和发布条件通过' }] };
}
function routingReasons(strategy, dimensions, artifactCount) {
    const reasons = [`选择 ${strategy}，避免不必要的 Agent 扩张`];
    if (dimensions.risk >= 2)
        reasons.push('检测到安全、凭证、发布或回滚风险，需要独立审查');
    if (dimensions.verification >= 2)
        reasons.push('任务包含明确测试或验收要求');
    if (artifactCount >= 2)
        reasons.push(`识别到 ${artifactCount} 个可独立处理的产物`);
    if (strategy === 'direct')
        reasons.push('任务结构简单，单 Agent 的成本和协调风险更低');
    return reasons;
}
function confidenceFor(total, strategy, artifactCount) {
    if (strategy === 'parallel-dag')
        return artifactCount >= 3 ? 0.93 : 0.84;
    if (strategy === 'direct')
        return total <= 1 ? 0.9 : 0.72;
    return Math.min(0.91, 0.7 + total * 0.025);
}
