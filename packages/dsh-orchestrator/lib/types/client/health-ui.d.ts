import type { HealthDimension, HealthStatus, ModelHealthSummary } from '../model-health.ts';
export type HealthTone = 'good' | 'warn' | 'bad' | 'muted';
export declare function healthTone(status: HealthStatus): HealthTone;
export declare function healthLabel(status: HealthStatus): string;
export declare function dimensionLabel(dimension: HealthDimension): string;
export declare function cacheRate(summary: HarnessDashboardLike): number | undefined;
type HarnessDashboardLike = Pick<import('../wire.ts').HarnessDashboardStatus, 'harness'>;
export declare function sparklinePoints(trend: ModelHealthSummary['trend'], width?: number, height?: number): string;
export {};
//# sourceMappingURL=health-ui.d.ts.map