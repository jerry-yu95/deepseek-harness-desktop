import { FeatureStatus, HarnessFeature, HarnessPhase, HarnessRun, HarnessSnapshot, TrajectoryItem, appendProgress, harnessContext, harnessContextSync, harnessDir, initHarness, loadHarness, redactSecrets, retrieveMemory, sanitizeTrajectory, transitionHarness, updateFeature } from "./core.mjs";
import { Context } from "@deepseek-ai/cordis";

//#region src/index.d.ts
declare const name = "harness-orchestrator";
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
export { FeatureStatus, HarnessFeature, HarnessPhase, HarnessRun, HarnessSnapshot, TrajectoryItem, appendProgress, apply, harnessContext, harnessContextSync, harnessDir, initHarness, inject, loadHarness, name, redactSecrets, retrieveMemory, sanitizeTrajectory, transitionHarness, updateFeature };
//# sourceMappingURL=index.d.mts.map