import type { Context } from '@deepseek-ai/cordis';
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands';
export declare const name = "harness-orchestrator";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
/** Direct UI fallback for environments where the enhanced-mode control is unavailable. */
export declare function executeHarnessCommand(invocation: CommandInvocation): Promise<CommandResult>;
export * from './core.ts';
export * from './orchestration.ts';
export * from './model-health.ts';
export * from './wire.ts';
//# sourceMappingURL=index.d.ts.map