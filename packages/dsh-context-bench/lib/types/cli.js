var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSyntheticCorpus } from "./corpus.js";
import { validateLiveOptions, LIVE_CONFIRMATION, runLiveBenchmark, DEFAULT_LIVE_SCALE } from "./runner/live.js";
import { assertBaselineComparable, assertSafeReport, readFixtureBytes, writeBenchmarkReport } from "./report.js";
import { parseBenchmarkFixture } from "./schema.js";
import { scoreCheckpoint, OFFICIAL_CHECKPOINT_SECTIONS } from "./scoring.js";
const PACKAGE_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURE_DIRECTORY = join(PACKAGE_ROOT, "fixtures");
const DEFAULT_OUTPUT_DIRECTORY = resolve(PACKAGE_ROOT, "../..", "artifacts/context-bench");
const BASELINE_PATH = join(PACKAGE_ROOT, "baselines/deterministic-rc6.json");
function argumentValue(args, name) {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
}
function hasArgument(args, name) {
    return args.includes(name);
}
function fixtureCheckpoint(fixture) {
    const sections = OFFICIAL_CHECKPOINT_SECTIONS.map((section) => `## ${section}`).join("\n");
    const facts = fixture.requiredFacts.map(({ value, aliases }) => `${value} ${aliases.join(" ")}`).join("\n");
    const nextStep = fixture.expectedNextStep ?? "Continue the pending work with the current decisions.";
    return `${sections}\n${facts}\n${nextStep}`;
}
function parseInteger(value, fallback) {
    if (value === undefined)
        return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        throw new Error(`invalid positive integer: ${value}`);
    return parsed;
}
async function deterministic(args) {
    const outputArgument = argumentValue(args, "--out");
    const outputDirectory = outputArgument
        ? (isAbsolute(outputArgument) ? resolve(outputArgument) : resolve(PACKAGE_ROOT, "../..", outputArgument))
        : DEFAULT_OUTPUT_DIRECTORY;
    const manifest = JSON.parse(await readFile(join(PACKAGE_ROOT, "package.json"), "utf8"));
    const officialPackages = Object.fromEntries(Object.entries(manifest.dependencies).filter(([name]) => name.startsWith("@deepseek-ai/")));
    const requestedFixture = argumentValue(args, "--fixture");
    const names = (await readdir(FIXTURE_DIRECTORY)).filter((name) => name.endsWith(".json"));
    const selected = requestedFixture ? names.filter((name) => name === `${requestedFixture}.json`) : names;
    if (selected.length === 0)
        throw new Error("no matching benchmark fixture");
    let failures = 0;
    const reports = [];
    for (const name of selected.sort()) {
        const fixturePath = join(FIXTURE_DIRECTORY, name);
        const { bytes, hash } = await readFixtureBytes(fixturePath);
        const fixture = parseBenchmarkFixture(bytes.toString("utf8"));
        const seed = parseInteger(argumentValue(args, "--seed"), 0) - 1;
        const corpus = buildSyntheticCorpus(fixture, { seed: Math.max(0, seed) });
        const scored = scoreCheckpoint(fixture, fixtureCheckpoint(fixture));
        const report = assertSafeReport({
            schemaVersion: 1,
            runId: `deterministic-${String(corpus.seed).padStart(2, "0")}`,
            tier: "deterministic",
            fixtureId: fixture.id,
            fixtureHash: hash,
            seed: corpus.seed,
            packages: officialPackages,
            adapter: { provider: "official-harness-fixture", model: "deterministic-oracle", contextWindow: corpus.targetTokenBudget },
            pressure: { before: corpus.estimatedMaterializedTokens, after: Math.max(1, Math.round(corpus.estimatedMaterializedTokens * 0.35)) },
            events: [{ seq: 0, type: "deterministic/score", success: !scored.hardFailure }],
            metrics: { ...scored.metrics, compressionRatio: 0.35, postCompactionPressure: 0.35 },
            usage: { inputTokens: corpus.estimatedMaterializedTokens, outputTokens: 256, cacheReadTokens: 0 },
            durationMs: 0,
            errors: scored.hardFailure ? [{ code: "hard-failure", message: "deterministic oracle missed a critical fact" }] : [],
        });
        reports.push(report);
        await writeBenchmarkReport(report, outputDirectory);
        console.log(`${fixture.id}: ${scored.hardFailure ? "FAIL" : "PASS"}`);
        if (scored.hardFailure)
            failures += 1;
    }
    if (!hasArgument(args, "--no-baseline")) {
        const baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
        assertBaselineComparable(reports, baseline);
    }
    return failures === 0 ? 0 : 1;
}
async function live(args) {
    const options = {
        live: hasArgument(args, "--live"),
        provider: argumentValue(args, "--provider") ?? "",
        model: argumentValue(args, "--model") ?? "",
        scale: (argumentValue(args, "--scale") ?? DEFAULT_LIVE_SCALE),
        maxInputTokens: parseInteger(argumentValue(args, "--max-input-tokens"), 32_768),
        maxOutputTokens: parseInteger(argumentValue(args, "--max-output-tokens"), 4_096),
        confirmation: argumentValue(args, "--confirm"),
        allowFullCapacity: hasArgument(args, "--allow-full-capacity"),
    };
    validateLiveOptions(options);
    if (options.confirmation !== LIVE_CONFIRMATION)
        throw new Error(`pass --confirm ${LIVE_CONFIRMATION}`);
    const adapterModule = argumentValue(args, "--adapter-module");
    if (!adapterModule) {
        throw new Error("no live adapter module supplied; use the host's official credential and model adapter seam");
    }
    const bridge = await import(__rewriteRelativeImportExtension(resolve(process.cwd(), adapterModule)));
    if (typeof bridge.resolveContextWindow !== "function" || typeof bridge.runProbe !== "function") {
        throw new Error("live adapter module must export resolveContextWindow and runProbe");
    }
    const result = await runLiveBenchmark(options, {
        resolveContextWindow: bridge.resolveContextWindow,
        runProbe: bridge.runProbe,
    });
    console.log(JSON.stringify(result, null, 2));
    return result.summary.hardFailureCount === 0 ? 0 : 1;
}
// pnpm appends a literal `--` when forwarding extra arguments to a package script.
// Treat it as a separator so `pnpm bench:context -- --out ...` behaves as documented.
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const tier = argumentValue(args, "--tier") ?? "deterministic";
const exitCode = tier === "deterministic" ? await deterministic(args) : await live(args);
process.exitCode = exitCode;
