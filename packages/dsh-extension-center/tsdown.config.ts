/**
 * Standalone build config for the extension-center plugin.
 *
 * Uses the repo's shared client-bundle preset (shared/tsdown.client.ts):
 * node-half lib/ (a no-op host loader) plus the browser bundle lib/client.js
 * (closure-factory artifact for the GUI's __ModuleLoader__, CSS Modules
 * inlined with auto-injected <style data-plugin>). The client entry is
 * auto-detected at src/client/index.ts by the preset.
 */
import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-client-ui-extension-center', ['src/index.ts'])
