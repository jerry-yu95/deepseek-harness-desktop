import { HarnessClientApi } from "./api.js";
import { HarnessComposerControls, HarnessSettingsCard } from "./HarnessHealthPanel.js";
export const inject = ['slots', 'connection'];
export function apply(ctx) {
    const api = new HarnessClientApi(ctx.get('connection'));
    const inject = () => ({ api });
    ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'harness-health', order: 80, inject }, HarnessComposerControls));
    ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({ name: 'web-ui.plugin.item', id: 'agent-harness', order: 70, inject }, HarnessSettingsCard));
}
export { HarnessClientApi } from "./api.js";
export { cacheRate, dimensionLabel, healthLabel, healthTone, sparklinePoints } from "./health-ui.js";
