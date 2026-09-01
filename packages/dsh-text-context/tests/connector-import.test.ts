import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CONNECTOR_IMPORT_EVENT,
  installConnectorImportBridge,
  rememberConnectorImportSource,
} from '../src/client/connector-import.ts'

afterEach(() => {
  vi.useRealTimers()
})

describe('connector import bridge', () => {
  it('hands the original MCP JSON to Connector Center without putting it in the model attachment', async () => {
    const attachment = {
      id: 'file_0123456789abcdef0123456789abcdef',
      name: 'mcp.json',
      mediaType: 'application/json',
      bytes: 32,
      kind: 'text' as const,
      redacted: true,
    }
    const original = '{"mcpServers":{"tapd":{"headers":{"Authorization":"test-value"}}}}'
    rememberConnectorImportSource(attachment, original)
    const takeConnectorImport = vi.fn()
      .mockResolvedValueOnce({
        requestId: '01234567-89ab-cdef-0123-456789abcdef',
        attachmentId: attachment.id,
        name: attachment.name,
        requestedServerNames: ['tapd'],
      })
      .mockResolvedValue(undefined)
    const listener = vi.fn()
    document.addEventListener(CONNECTOR_IMPORT_EVENT, listener)
    const stop = installConnectorImportBridge({ takeConnectorImport }, document, 60_000)
    await vi.waitFor(() => { expect(listener).toHaveBeenCalledOnce() })
    const event = listener.mock.calls[0]?.[0] as CustomEvent
    expect(event.detail.text).toBe(original)
    expect(event.detail.name).toBe('mcp.json')
    expect(event.detail.requestedServerNames).toEqual(['tapd'])
    stop()
    document.removeEventListener(CONNECTOR_IMPORT_EVENT, listener)
  })

  it('keeps only a bounded number of pending imports and consumes each handoff once', async () => {
    const attachments = Array.from({ length: 9 }, (_, index) => ({
      id: `file_${String(index).padStart(32, '0')}`,
      name: `mcp-${index}.json`,
      mediaType: 'application/json',
      bytes: 24,
      kind: 'text' as const,
      redacted: true,
    }))
    attachments.forEach((attachment) => rememberConnectorImportSource(attachment, `{"mcpServers":{"server-${attachment.name}" : {}}}`))
    const listener = vi.fn()
    document.addEventListener(CONNECTOR_IMPORT_EVENT, listener)
    const takeConnectorImport = vi.fn()
      .mockResolvedValueOnce({ requestId: 'old', attachmentId: attachments[0].id, name: attachments[0].name })
      .mockResolvedValueOnce({ requestId: 'new', attachmentId: attachments[8].id, name: attachments[8].name })
      .mockResolvedValue(undefined)
    const stop = installConnectorImportBridge({ takeConnectorImport }, document, 5)
    try {
      await vi.waitFor(() => { expect(listener).toHaveBeenCalledOnce() })
      expect(listener.mock.calls[0]?.[0].detail).toMatchObject({ requestId: 'new', name: 'mcp-8.json' })
      expect(listener.mock.calls[0]?.[0].detail.text).toContain('server-mcp-8.json')
    } finally {
      stop()
      document.removeEventListener(CONNECTOR_IMPORT_EVENT, listener)
    }
  })
})
