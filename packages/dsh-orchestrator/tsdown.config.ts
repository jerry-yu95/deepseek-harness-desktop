import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle(
  '@harness-design/dsh-orchestrator',
  ['src/index.ts', 'src/core.ts', 'src/adaptive.ts', 'src/orchestration.ts', 'src/model-health.ts', 'src/observability.ts', 'src/wire.ts'],
  { lib: { external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-workflow'] } },
)
