/** In-memory handoff from a local attachment reference to the import dialog. */

export const CONNECTOR_IMPORT_EVENT = 'dsh:connector-import-preview'

export interface ConnectorImportEventDetail {
  text: string
  name: string
  requestId: string
  requestedServerNames?: string[]
}

type Listener = (detail: ConnectorImportEventDetail) => void

let pending: ConnectorImportEventDetail | undefined
const listeners = new Set<Listener>()

export function acceptConnectorImport(detail: unknown): boolean {
  if (!isConnectorImportDetail(detail)) return false
  pending = detail
  for (const listener of listeners) listener(detail)
  return true
}

export function subscribeConnectorImport(listener: Listener): () => void {
  listeners.add(listener)
  if (pending !== undefined) listener(pending)
  return () => { listeners.delete(listener) }
}

export function consumeConnectorImport(requestId: string): void {
  if (pending?.requestId === requestId) pending = undefined
}

function isConnectorImportDetail(value: unknown): value is ConnectorImportEventDetail {
  if (value === null || typeof value !== 'object') return false
  const detail = value as Partial<ConnectorImportEventDetail>
  return typeof detail.text === 'string'
    && detail.text.length > 0
    && detail.text.length <= 1024 * 1024
    && typeof detail.name === 'string'
    && /^.{1,255}\.jsonc?$/iu.test(detail.name)
    && typeof detail.requestId === 'string'
    && /^[0-9a-f-]{36}$/iu.test(detail.requestId)
    && (detail.requestedServerNames === undefined || isRequestedServerNames(detail.requestedServerNames))
}

function isRequestedServerNames(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= 16
    && value.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 128 && !/[\u0000-\u001f\u007f]/u.test(name))
}

function normalizedServerName(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9\p{L}\p{N}]+/gu, '')
}

export function selectedServerMap(serverNames: string[], requestedServerNames?: string[]): Record<string, boolean> {
  if (requestedServerNames === undefined) return Object.fromEntries(serverNames.map((name) => [name, true]))
  const requested = requestedServerNames.map(normalizedServerName).filter((name) => name.length > 0)
  return Object.fromEntries(serverNames.map((name) => {
    const normalized = normalizedServerName(name)
    const selected = requested.some((target) => normalized === target || (target.length >= 3 && normalized.includes(target)))
    return [name, selected]
  }))
}
