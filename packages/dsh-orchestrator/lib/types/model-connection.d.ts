import { type LlmRuntime } from '@deepseek-ai/dsh-llm';
export type ModelConnectionCategory = 'ready' | 'credentials' | 'endpoint-not-found' | 'model-not-found' | 'protocol' | 'rate-limit' | 'timeout' | 'network' | 'provider';
export interface ModelConnectionResult {
    ok: boolean;
    provider: string;
    model: string;
    category: ModelConnectionCategory;
    latencyMs: number;
    detail: string;
}
export declare function testModelConnection(input: {
    llm: LlmRuntime;
    provider: string;
    model: string;
    signal: AbortSignal;
}): Promise<ModelConnectionResult>;
export declare function classifyModelConnectionError(error: unknown, aborted?: boolean): Pick<ModelConnectionResult, 'category' | 'detail'>;
//# sourceMappingURL=model-connection.d.ts.map