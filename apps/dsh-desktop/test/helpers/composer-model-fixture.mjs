import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(new URL('../../../../packages/dsh-knowledge/package.json', import.meta.url))
const { LlmAdapter } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')).href)
export const name = 'composer-model-fixture'
export const inject = ['llm']
export const MODEL = 'fixture-long-model-name-for-composer-layout-中文混合名称'

class FixtureAdapter extends LlmAdapter {
  async listModels(provider) { return [{ provider, id: MODEL, name: MODEL, inputModalities: ['text'] }] }
  async resolveModel(provider, model) { return { provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 128_000 } } }
  async *stream(options) {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    for (let index = 0; index < 120; index++) {
      if (options.signal?.aborted) { yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'Fixture cancelled' } } }; return }
      yield { type: 'text-delta', index: 0, text: index === 0 ? 'JIWEI_COMPOSER_FIXTURE ' : '合成流式内容 ' }
      await new Promise(resolve => {
        const finish = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', finish); resolve() }
        const timer = setTimeout(finish, 100)
        options.signal?.addEventListener('abort', finish, { once: true })
      })
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx) {
  if (process.env.DSH_COMPOSER_E2E !== '1') throw new Error('Fixture requires an isolated test profile')
  ctx.llm.registerAdapter(['composer-fixture'], new FixtureAdapter())
}
