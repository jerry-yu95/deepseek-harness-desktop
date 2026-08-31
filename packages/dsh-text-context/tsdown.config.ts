/**
 * Standalone build config for the text-context plugin.
 *
 * Uses the repo's shared client-bundle preset: node-half lib/ (a no-op host
 * loader) plus the browser bundle lib/client.js.
 */
import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-text-context', ['src/index.ts'])
