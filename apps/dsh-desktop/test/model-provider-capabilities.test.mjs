import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import YAML from 'yaml'

import { getModelImageInput, setModelImageInput } from '../src/model-provider-capabilities.mjs'

test('model image capability is explicit, reversible, and preserves unrelated settings', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-model-capability-'))
  const filename = join(home, 'settings.yaml')
  await writeFile(filename, `llm-pi-ai:\n  providers:\n    zhipu-coding:\n      baseURL: https://open.bigmodel.cn/api/coding/paas/v4\n      api: openai-completions\n      models:\n        - id: glm-5.3-flash\nother-plugin:\n  keep: true\n`, 'utf8')
  try {
    const target = { baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4/', model: 'glm-5.3-flash' }
    assert.deepEqual(await getModelImageInput(home, target), { ok: true, enabled: false, model: 'glm-5.3-flash' })
    assert.deepEqual(await setModelImageInput(home, { ...target, enabled: true }), { ok: true, enabled: true, model: 'glm-5.3-flash' })
    assert.deepEqual(await getModelImageInput(home, target), { ok: true, enabled: true, model: 'glm-5.3-flash' })
    let parsed = YAML.parse(await readFile(filename, 'utf8'))
    assert.deepEqual(parsed['llm-pi-ai'].providers['zhipu-coding'].models[0].input, ['text', 'image'])
    assert.equal(parsed['other-plugin'].keep, true)
    await setModelImageInput(home, { providerId: 'zhipu-coding', model: 'glm-5.3-flash', enabled: false })
    parsed = YAML.parse(await readFile(filename, 'utf8'))
    assert.deepEqual(parsed['llm-pi-ai'].providers['zhipu-coding'].models[0].input, ['text'])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('model image capability does not create an unsaved provider', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-model-capability-empty-'))
  await mkdir(home, { recursive: true })
  try {
    const result = await getModelImageInput(home, { providerId: 'missing', model: 'missing-model' })
    assert.equal(result.ok, false)
    await assert.rejects(() => setModelImageInput(home, { providerId: 'missing', model: 'missing-model', enabled: true }), /未找到已保存/u)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
