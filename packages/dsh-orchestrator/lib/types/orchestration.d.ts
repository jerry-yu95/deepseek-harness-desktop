import type { Agent } from '@deepseek-ai/dsh-agent';
import type { WorkflowEngine } from '@deepseek-ai/dsh-workflow';
export type OrchestrationRole = 'planner' | 'reviewer' | 'evaluator';
export interface PlannerResult {
    summary: string;
    features: Array<{
        id: string;
        title: string;
        acceptance: string;
    }>;
    risks: string[];
}
export interface ReviewerResult {
    summary: string;
    verdict: 'pass' | 'repair';
    findings: string[];
}
export interface EvaluatorResult {
    summary: string;
    decision: 'complete' | 'repair' | 'blocked';
    featureResults: Array<{
        id: string;
        status: 'passed' | 'failed';
        evidence: string;
    }>;
}
export type RoleResult = PlannerResult | ReviewerResult | EvaluatorResult;
export interface RoleRunRequest {
    cwd: string;
    role: OrchestrationRole;
    parent: Agent;
    signal: AbortSignal;
    workflowEngine: WorkflowEngine;
    evidence?: string;
    bypassCache?: boolean;
}
export interface RoleRunOutcome {
    ok: boolean;
    cached: boolean;
    role: OrchestrationRole;
    result?: RoleResult;
    fallback?: 'standard';
    error?: string;
}
export declare function workspaceFingerprint(cwd: string): Promise<string>;
export declare function runOrchestrationRole(request: RoleRunRequest): Promise<RoleRunOutcome>;
//# sourceMappingURL=orchestration.d.ts.map