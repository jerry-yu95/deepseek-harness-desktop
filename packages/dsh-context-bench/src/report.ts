import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BenchmarkReportSchema, type BenchmarkReport } from "./schema.ts";

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /Bearer\s+[A-Za-z0-9._~-]{20,}/gi,
];
const ABSOLUTE_PATH = /(?:\/Users\/[^\s/]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\|\/home\/[^\s/]+\/)/g;

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function redactReportText(value: string): string {
  return SECRET_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value.replace(ABSOLUTE_PATH, "[LOCAL_PATH]/"),
  );
}

export function assertSafeReport(report: BenchmarkReport): BenchmarkReport {
  const parsed = BenchmarkReportSchema.parse(report);
  const serialized = JSON.stringify(parsed);
  const redacted = redactReportText(serialized);
  if (serialized !== redacted) {
    throw new Error("benchmark report contains a credential or absolute user path");
  }
  return parsed;
}

export interface DeterministicBaseline {
  schemaVersion: 1;
  tier: "deterministic";
  officialPackages: Record<string, string>;
  adapter: { provider: string; model: string };
  fixtures: Record<string, string>;
  contextWindows: Record<string, number>;
  gates: {
    criticalRecall: number;
    exactLiteralRecall: number;
    latestStateAccuracy: number;
    staleLeakage: number;
    toolIntegrity: number;
    sectionCompleteness: number;
  };
}

export function assertBaselineComparable(
  reports: readonly BenchmarkReport[],
  baseline: DeterministicBaseline,
): void {
  if (baseline.schemaVersion !== 1 || baseline.tier !== "deterministic") {
    throw new Error("unsupported deterministic baseline schema");
  }
  const fixtureHashes = new Map(reports.map((report) => [report.fixtureId, report.fixtureHash]));
  for (const report of reports) {
    if (report.adapter.provider !== baseline.adapter.provider || report.adapter.model !== baseline.adapter.model) {
      throw new Error(`${report.fixtureId} adapter identity changed; deterministic baseline must be reviewed`);
    }
    if (report.adapter.contextWindow !== baseline.contextWindows[report.fixtureId]) {
      throw new Error(`${report.fixtureId} context window changed; deterministic baseline must be reviewed`);
    }
    for (const [packageName, expectedVersion] of Object.entries(baseline.officialPackages)) {
      if (report.packages[packageName] !== expectedVersion) {
        throw new Error(`${packageName} changed; deterministic baseline must be reviewed`);
      }
    }
  }
  for (const [fixtureId, expectedHash] of Object.entries(baseline.fixtures)) {
    if (fixtureHashes.get(fixtureId) !== expectedHash) {
      throw new Error(`fixture ${fixtureId} changed; deterministic baseline must be reviewed`);
    }
  }
  if (fixtureHashes.size !== Object.keys(baseline.fixtures).length) {
    throw new Error("fixture set changed; deterministic baseline must be reviewed");
  }
  for (const report of reports) {
    const gateEntries: Array<[keyof DeterministicBaseline["gates"], number]> = [
      ["criticalRecall", report.metrics.criticalRecall],
      ["exactLiteralRecall", report.metrics.exactLiteralRecall],
      ["latestStateAccuracy", report.metrics.latestStateAccuracy],
      ["staleLeakage", report.metrics.staleLeakage],
      ["toolIntegrity", report.metrics.toolIntegrity],
      ["sectionCompleteness", report.metrics.sectionCompleteness],
    ];
    for (const [metric, actual] of gateEntries) {
      const expected = baseline.gates[metric];
      const passed = metric === "staleLeakage" ? actual <= expected : actual >= expected;
      if (!passed) throw new Error(`${report.fixtureId} regressed ${metric}: ${actual} vs baseline gate ${expected}`);
    }
  }
}

export function formatBenchmarkReportMarkdown(report: BenchmarkReport): string {
  const safe = assertSafeReport(report);
  const metrics = safe.metrics;
  const errors = safe.errors.length === 0 ? "- none" : safe.errors.map(({ code, message }) => `- ${code}: ${message}`).join("\n");
  return [
    `# Context benchmark: ${safe.fixtureId}`,
    "",
    `- Tier: ${safe.tier}`,
    `- Run: ${safe.runId}`,
    `- Fixture hash: \`${safe.fixtureHash}\``,
    `- Adapter: ${safe.adapter.provider}/${safe.adapter.model}`,
    `- Context window: ${safe.adapter.contextWindow.toLocaleString()} tokens`,
    `- Seed: ${safe.seed}`,
    "",
    "## Metrics",
    "",
    `- Critical recall: ${metrics.criticalRecall}%`,
    `- Exact literal recall: ${metrics.exactLiteralRecall}%`,
    `- Latest state accuracy: ${metrics.latestStateAccuracy}%`,
    `- Stale leakage: ${metrics.staleLeakage}%`,
    `- Section completeness: ${metrics.sectionCompleteness}%`,
    `- Tool integrity: ${metrics.toolIntegrity}%`,
    `- Compression ratio: ${metrics.compressionRatio.toFixed(3)}`,
    `- Post-compaction pressure: ${metrics.postCompactionPressure.toFixed(3)}`,
    "",
    "## Usage",
    "",
    `- Input: ${safe.usage.inputTokens.toLocaleString()} tokens`,
    `- Output: ${safe.usage.outputTokens.toLocaleString()} tokens`,
    `- Cache read: ${safe.usage.cacheReadTokens.toLocaleString()} tokens`,
    `- Duration: ${safe.durationMs} ms`,
    "",
    "## Errors",
    "",
    errors,
    "",
  ].join("\n");
}

export async function writeBenchmarkReport(report: BenchmarkReport, outputDirectory: string): Promise<{ jsonPath: string; markdownPath: string }> {
  const safe = assertSafeReport(report);
  await mkdir(outputDirectory, { recursive: true });
  const baseName = `${safe.fixtureId}-${safe.runId}`;
  const jsonPath = join(outputDirectory, `${baseName}.json`);
  const markdownPath = join(outputDirectory, `${baseName}.md`);
  await writeFile(jsonPath, `${JSON.stringify(safe, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, formatBenchmarkReportMarkdown(safe), "utf8");
  return { jsonPath, markdownPath };
}

export async function readFixtureBytes(path: string): Promise<{ bytes: Buffer; hash: string }> {
  const bytes = await readFile(path);
  return { bytes, hash: sha256(bytes) };
}
