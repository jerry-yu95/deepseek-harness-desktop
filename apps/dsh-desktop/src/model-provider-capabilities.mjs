import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import YAML from 'yaml'

const SETTINGS_NS = 'llm-pi-ai'

/** Read whether one saved custom model declares image input. */
export async function getModelImageInput(dshHome, input) {
  const request = normalizeRequest(input)
  const document = await readSettings(join(dshHome, 'settings.yaml'))
  const match = findModel(document, request)
  if (match === undefined) return { ok: false, enabled: false, detail: '请先保存提供方，再启用图片输入。' }
  return { ok: true, enabled: match.input.includes('image'), model: request.model }
}

/** Persist an explicit text/image modality declaration for one saved model. */
export async function setModelImageInput(dshHome, input) {
  const request = normalizeRequest(input)
  if (typeof input.enabled !== 'boolean') throw new TypeError('图片输入开关无效')
  const filename = join(dshHome, 'settings.yaml')
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
  return withFileLock(filename, async () => {
    const document = await readSettings(filename)
    const match = findModel(document, request)
    if (match === undefined) throw new Error('未找到已保存的提供方和模型，请先保存后重试。')
    const next = new Set(match.input)
    next.add('text')
    if (input.enabled) next.add('image')
    else next.delete('image')
    document.setIn([SETTINGS_NS, 'providers', match.route, 'models', match.index, 'input'], [...next])
    await writeFileAtomic(filename, document.toString({ lineWidth: 0 }), { mode: 0o600, dirMode: 0o700 })
    return { ok: true, enabled: input.enabled, model: request.model }
  })
}

function normalizeRequest(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('模型能力参数无效')
  const providerId = optionalText(input.providerId)
  const baseURL = optionalText(input.baseURL)
  const model = requiredText(input.model, '模型 ID')
  if (providerId === undefined && baseURL === undefined) throw new TypeError('请提供 Provider ID 或 API 地址')
  return { providerId, baseURL: baseURL === undefined ? undefined : normalizeUrl(baseURL), model }
}

async function readSettings(filename) {
  let text
  try { text = await readFile(filename, 'utf8') } catch (error) {
    if (error?.code === 'ENOENT') return YAML.parseDocument('{}\n')
    throw error
  }
  const document = YAML.parseDocument(text)
  if (document.errors.length > 0) throw new Error('模型设置文件无法解析，请先修复 settings.yaml。')
  return document
}

function findModel(document, request) {
  const providers = document.getIn([SETTINGS_NS, 'providers'])?.toJSON?.() ?? {}
  if (providers === null || typeof providers !== 'object' || Array.isArray(providers)) return undefined
  const candidates = []
  for (const [route, provider] of Object.entries(providers)) {
    if (provider === null || typeof provider !== 'object' || Array.isArray(provider)) continue
    if (request.providerId !== undefined && route !== request.providerId) continue
    if (request.baseURL !== undefined && normalizeUrl(optionalText(provider.baseURL) ?? '') !== request.baseURL) continue
    if (!Array.isArray(provider.models)) continue
    const index = provider.models.findIndex(model => model?.id === request.model)
    if (index < 0) continue
    const declared = provider.models[index]?.input
    candidates.push({ route, index, input: Array.isArray(declared) ? declared.filter(value => value === 'text' || value === 'image') : ['text'] })
  }
  if (candidates.length > 1) throw new Error('找到多个同名模型，请填写 Provider ID 后重试。')
  return candidates[0]
}

function normalizeUrl(value) {
  try { return new URL(value).toString().replace(/\/$/u, '') } catch { return value.trim().replace(/\/$/u, '') }
}

function optionalText(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function requiredText(value, label) {
  const text = optionalText(value)
  if (text === undefined) throw new TypeError(`请填写${label}`)
  return text
}
