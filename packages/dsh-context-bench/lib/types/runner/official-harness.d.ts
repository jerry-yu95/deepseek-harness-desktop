import { Context } from "@deepseek-ai/cordis";
import { DeterministicCompactionAdapter } from "./fake-adapter.ts";
export declare function createOfficialHarness(summary: string | readonly string[], contextWindow?: number, compactionConfig?: Record<string, unknown>, blockUntilAbort?: boolean, prunerConfig?: Record<string, unknown>): Promise<{
    ctx: Context;
    adapter: DeterministicCompactionAdapter;
    session: import("@deepseek-ai/dsh-session").Session;
}>;
export declare function appendUserText(session: ReturnType<Context["sessions"]["create"]>, text: string): {
    type: "user/message";
    seq: number;
    time: number;
    data: import("@deepseek-ai/dsh-llm").UserMessage;
    ignorable?: true;
} & {
    sourceEventSeqs?: number[];
    surfaceOp?: import("@deepseek-ai/dsh-session").SurfaceOp;
};
//# sourceMappingURL=official-harness.d.ts.map