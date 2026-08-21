import { appendProgress, harnessContext, harnessContextSync, harnessDir, initHarness, loadHarness, redactSecrets, retrieveMemory, sanitizeTrajectory, transitionHarness, updateFeature } from "./core.js";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/index.ts
const name = "harness-orchestrator";
const inject = ["systemPrompt", "tools"];
function apply(ctx) {
	ctx.systemPrompt.context({
		name: "harness:project-state",
		order: 80,
		text: (assemble) => assemble.agent?.session.header.cwd === void 0 ? "" : harnessContextSync(assemble.agent.session.header.cwd)
	});
	ctx.tools.register(defineTool({
		name: "harness_state",
		description: "Manage the project-local Harness objective, acceptance ledger, progress checkpoints, and validated phase transitions.",
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: [
					"init",
					"status",
					"transition",
					"feature",
					"checkpoint"
				]
			},
			objective: { type: "string" },
			features: {
				type: "array",
				items: { type: "string" }
			},
			phase: {
				type: "string",
				enum: [
					"planning",
					"executing",
					"evaluating",
					"repairing",
					"complete",
					"blocked"
				]
			},
			featureId: { type: "string" },
			status: {
				type: "string",
				enum: [
					"pending",
					"in_progress",
					"passed",
					"failed"
				]
			},
			evidence: { type: "string" },
			note: { type: "string" }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute(args, exec) {
			const cwd = exec.agent?.session.header.cwd;
			if (cwd === void 0) throw new Error("harness_state requires an agent workspace");
			switch (args.action) {
				case "init": return summarize(await initHarness(cwd, args.objective ?? "", args.features ?? []));
				case "status": {
					const value = await loadHarness(cwd);
					return value === void 0 ? { initialized: false } : summarize(value);
				}
				case "transition":
					if (args.phase === void 0) throw new Error("phase-required");
					return summarize(await transitionHarness(cwd, args.phase));
				case "feature":
					if (args.featureId === void 0 || args.status === void 0) throw new Error("featureId-and-status-required");
					return summarize(await updateFeature(cwd, args.featureId, args.status, args.evidence));
				case "checkpoint":
					if (args.note === void 0) throw new Error("note-required");
					return summarize(await appendProgress(cwd, args.note));
			}
		}
	}));
}
function summarize(snapshot) {
	return {
		initialized: true,
		objective: snapshot.run.objective,
		phase: snapshot.run.phase,
		passed: snapshot.features.filter((item) => item.status === "passed").length,
		total: snapshot.features.length,
		features: snapshot.features.map((item) => ({
			id: item.id,
			title: item.title,
			acceptance: item.acceptance,
			status: item.status,
			evidence: [...item.evidence]
		}))
	};
}
//#endregion
export { appendProgress, apply, harnessContext, harnessContextSync, harnessDir, initHarness, inject, loadHarness, name, redactSecrets, retrieveMemory, sanitizeTrajectory, transitionHarness, updateFeature };
