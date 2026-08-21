import { defineConfig } from 'tsdown'

export default defineConfig({
  name: '@harness-design/dsh-orchestrator',
  entry: ['src/index.ts', 'src/core.ts'],
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools'],
})
