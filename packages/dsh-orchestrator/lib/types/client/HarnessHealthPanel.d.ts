import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { HarnessClientApi } from './api.ts';
export interface HarnessFace {
    api: HarnessClientApi;
}
type ControlProps = PropsRuntime<'conversation.input.left'> & HarnessFace;
export declare function HarnessComposerControls(props: ControlProps): import("react").JSX.Element;
type SettingsProps = PropsRuntime<'web-ui.plugin.item'> & HarnessFace;
export declare function HarnessSettingsCard(props: SettingsProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=HarnessHealthPanel.d.ts.map