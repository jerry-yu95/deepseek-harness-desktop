import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm';
export async function testModelConnection(input) {
    const startedAt = Date.now();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort('model-connection-timeout'), 20_000);
    const signal = AbortSignal.any([input.signal, timeout.signal]);
    try {
        await input.llm.resolveModelInfo(input.provider, input.model, signal);
        const assembler = new BlockAssembler();
        for await (const chunk of input.llm.stream({
            provider: input.provider,
            model: input.model,
            messages: [createUserMessage({ content: [{ type: 'text', text: 'Reply with OK only.' }], source: { kind: 'user' } })],
            system: 'This is a connection test. Reply with OK only.',
            maxTokens: 8,
            temperature: 0,
            signal,
        }))
            assembler.push(chunk);
        const finish = assembler.finish;
        if (finish.kind === 'error' || finish.kind === 'aborted')
            throw new Error(finish.failure.message);
        return { ok: true, provider: input.provider, model: input.model, category: 'ready', latencyMs: Date.now() - startedAt, detail: '最小推理请求成功，当前模型路由可用。' };
    }
    catch (error) {
        const classified = classifyModelConnectionError(error, signal.aborted);
        return { ok: false, provider: input.provider, model: input.model, latencyMs: Date.now() - startedAt, ...classified };
    }
    finally {
        clearTimeout(timer);
    }
}
export function classifyModelConnectionError(error, aborted = false) {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    if (aborted || /abort|timeout|timed out/u.test(normalized))
        return { category: 'timeout', detail: '连接测试超时；请检查网络、Base URL 和服务可用性。' };
    if (/\b(?:401|403)\b|unauthori[sz]ed|forbidden|credential|api[ _-]?key/u.test(normalized))
        return { category: 'credentials', detail: '密钥或权限问题：服务拒绝了凭证，请检查 API Key、授权范围和账号状态。' };
    if (/model[_ -]?not[_ -]?found|unknown model|invalid model|no such model|model.{0,80}does not exist/u.test(normalized)) {
        return { category: 'model-not-found', detail: '模型 ID 不正确，或当前密钥无权使用该模型。' };
    }
    if (/\b404\b|not found/u.test(normalized))
        return { category: 'endpoint-not-found', detail: 'API 地址、协议或路径不匹配：服务返回 404，请检查 Base URL 是否包含正确路径（常见为 /v1）。' };
    if (/\b(?:400|405|415|422)\b|bad request|unsupported|protocol/u.test(normalized))
        return { category: 'protocol', detail: '响应格式不兼容：请检查提供方类型、API 协议、Base URL 和模型 ID。' };
    if (/\b429\b|rate.?limit|too many requests/u.test(normalized))
        return { category: 'rate-limit', detail: '提供方已限流或额度不足；请稍后重试并检查账户额度。' };
    if (/fetch failed|econn|enotfound|network|socket|dns/u.test(normalized))
        return { category: 'network', detail: '无法连接模型服务；请检查网络、代理、DNS 和 Base URL。' };
    return { category: 'provider', detail: `模型服务返回异常：${redact(message)}` };
}
function redact(message) {
    return message
        .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
        .replace(/(authorization)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
        .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]+\b/gu, '[REDACTED]')
        .slice(0, 300);
}
