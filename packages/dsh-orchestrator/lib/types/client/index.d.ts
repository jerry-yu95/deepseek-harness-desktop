import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'settings.plugin.item': {
            kind: 'list';
            scope: 'root';
            owner: {
                children?: never;
            };
        };
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export { HarnessClientApi } from './api.ts';
export { cacheRate, dimensionLabel, healthLabel, healthTone, sparklinePoints } from './health-ui.ts';
//# sourceMappingURL=index.d.ts.map