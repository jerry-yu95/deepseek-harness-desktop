import { containsExact, normalizeForMatch } from "./oracle.ts";
import type { BenchmarkFixture, BenchmarkMetrics } from "./schema.ts";

export const OFFICIAL_CHECKPOINT_SECTIONS = [
  "Primary Request and Intent",
  "Key Technical Concepts",
  "Files and Code",
  "Errors and Fixes",
  "Pending Jobs",
  "Current Work",
  "Next Step",
  "Critical Context",
] as const;

export interface ScoreResult {
  metrics: BenchmarkMetrics;
  hardFailure: boolean;
  missingCriticalFacts: string[];
  staleLeaks: string[];
  fabricatedClaims: string[];
}

function weightedRecall(fixture: BenchmarkFixture, categories: Set<string>, text: string): number {
  const facts = fixture.requiredFacts.filter(({ category }) => categories.has(category));
  if (facts.length === 0) return 100;
  const total = facts.reduce((sum, fact) => sum + fact.weight, 0);
  const hit = facts.reduce((sum, fact) => {
    const candidates = [fact.value, ...fact.aliases];
    return sum + (candidates.some((value) => containsExact(text, value)) ? fact.weight : 0);
  }, 0);
  return Math.round((hit / total) * 100);
}

function findFabrications(text: string): string[] {
  const normalized = normalizeForMatch(text);
  return ["Redis", "MongoDB", "Cassandra"].filter((claim) => normalized.includes(claim.toLowerCase()));
}

export function scoreCheckpoint(fixture: BenchmarkFixture, checkpoint: string, retainedTail = ""): ScoreResult {
  const combined = `${checkpoint}\n${retainedTail}`;
  const missingCriticalFacts = fixture.requiredFacts
    .filter((fact) => fact.critical && ![fact.value, ...fact.aliases].some((value) => containsExact(combined, value)))
    .map(({ id }) => id);
  const staleLeaks = fixture.supersededFacts.flatMap(({ staleValues }) => staleValues.filter((value) => containsExact(checkpoint, value)));
  const sectionHits = OFFICIAL_CHECKPOINT_SECTIONS.filter((section) => new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(checkpoint));
  const exactLiteralRecall = weightedRecall(fixture, new Set(["exact"]), combined);
  const latestStateAccuracy = weightedRecall(fixture, new Set(["mutable"]), combined);
  const constraintRecall = weightedRecall(fixture, new Set(["constraint"]), combined);
  const pendingWorkRecall = weightedRecall(fixture, new Set(["pending"]), combined);
  const toolIntegrity = weightedRecall(fixture, new Set(["tool"]), combined);
  const criticalTotal = fixture.requiredFacts.filter(({ critical }) => critical).length;
  const criticalRecall = criticalTotal === 0 ? 100 : Math.round(((criticalTotal - missingCriticalFacts.length) / criticalTotal) * 100);

  return {
    metrics: {
      criticalRecall,
      exactLiteralRecall,
      latestStateAccuracy,
      staleLeakage: staleLeaks.length === 0 ? 0 : 100,
      constraintRecall,
      pendingWorkRecall,
      toolIntegrity,
      sectionCompleteness: Math.round((sectionHits.length / OFFICIAL_CHECKPOINT_SECTIONS.length) * 100),
      postCompactionPressure: 0,
      compressionRatio: 0,
      multiCycleRetention: [criticalRecall],
    },
    hardFailure: missingCriticalFacts.length > 0 || staleLeaks.length > 0,
    missingCriticalFacts,
    staleLeaks,
    fabricatedClaims: findFabrications(checkpoint),
  };
}
