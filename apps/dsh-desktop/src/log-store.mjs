import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SECRET_ASSIGNMENT = /\b((?:NPM_TOKEN|DEEPSEEK_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|API_KEY|ACCESS_TOKEN|AUTH_TOKEN|DSH_CONNECTOR_[A-Z0-9_]+))=([^\s]+)/gi
const BEARER_TOKEN = /(Authorization:\s*Bearer\s+)([^\s]+)/gi

export function sanitizeLogLine(value) {
  return String(value)
    .replace(BEARER_TOKEN, '$1[redacted]')
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]')
    .replaceAll('\u0000', '')
}

async function fileSize(path) {
  try {
    return (await stat(path)).size
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
}

async function readIfPresent(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

export class BoundedLogStore {
  constructor({ directory, baseName = 'runtime.log', maxBytes = 1_048_576, maxFiles = 4 }) {
    if (!directory) throw new TypeError('log directory is required')
    if (!Number.isInteger(maxBytes) || maxBytes < 32) throw new TypeError('maxBytes must be at least 32')
    if (!Number.isInteger(maxFiles) || maxFiles < 1) throw new TypeError('maxFiles must be positive')
    this.directory = directory
    this.path = join(directory, baseName)
    this.maxBytes = maxBytes
    this.maxFiles = maxFiles
    this.queue = Promise.resolve()
  }

  append(value) {
    const operation = this.queue.then(() => this.#append(value))
    this.queue = operation.catch(() => {})
    return operation
  }

  async #append(value) {
    await mkdir(this.directory, { recursive: true })
    let entry = Buffer.from(`${sanitizeLogLine(value).replace(/[\r\n]+$/u, '')}\n`, 'utf8')
    if (entry.byteLength > this.maxBytes) entry = entry.subarray(entry.byteLength - this.maxBytes)
    if ((await fileSize(this.path)) + entry.byteLength > this.maxBytes) await this.#rotate()
    await writeFile(this.path, entry, { flag: 'a' })
  }

  async #rotate() {
    if (this.maxFiles === 1) {
      await writeFile(this.path, '')
      return
    }
    for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
      const source = index === 1 ? this.path : `${this.path}.${index - 1}`
      const destination = `${this.path}.${index}`
      await rm(destination, { force: true })
      try {
        await rename(source, destination)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
  }

  async tail(maxLines = 200) {
    await this.queue
    const chunks = []
    for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
      chunks.push(await readIfPresent(`${this.path}.${index}`))
    }
    chunks.push(await readIfPresent(this.path))
    return chunks
      .join('')
      .split(/\r?\n/u)
      .filter(Boolean)
      .slice(-maxLines)
      .join('\n')
  }
}
