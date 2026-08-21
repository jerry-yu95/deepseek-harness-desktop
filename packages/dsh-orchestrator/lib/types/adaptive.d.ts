export type AdaptiveStrategy = 'direct' | 'plan-execute' | 'plan-review' | 'parallel-dag';
export interface TaskDimensions {
    depth: number;
    horizon: number;
    breadth: number;
    parallelism: number;
    verification: number;
    risk: number;
}
export interface AdaptiveBudget {
    maxAgents: number;
    maxTotalTokens: number;
    maxWallTimeMs: number;
    maxRetries: number;
}
export interface AdaptiveNode {
    id: string;
    title: string;
    role: 'primary' | 'planner' | 'worker' | 'verifier' | 'synthesizer';
    dependsOn: string[];
    acceptance: string;
    parallelGroup?: string;
}
export interface AdaptiveDag {
    version: 1;
    nodes: AdaptiveNode[];
}
export interface AdaptiveDecision {
    version: 1;
    id: string;
    objective: string;
    strategy: AdaptiveStrategy;
    confidence: number;
    reasons: string[];
    dimensions: TaskDimensions;
    budget: AdaptiveBudget;
    dag: AdaptiveDag;
    fallback: 'standard';
}
export declare function assessTask(rawObjective: string): AdaptiveDecision;
export declare function validateAdaptiveDag(dag: AdaptiveDag, budget: AdaptiveBudget): void;
//# sourceMappingURL=adaptive.d.ts.map