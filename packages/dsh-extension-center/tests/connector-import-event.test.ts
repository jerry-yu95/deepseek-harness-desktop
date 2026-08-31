import { describe, expect, it, vi } from 'vitest'

import {
  acceptConnectorImport,
  consumeConnectorImport,
  selectedServerMap,
  subscribeConnectorImport,
} from '../src/client/connector-import-event.ts'

describe('connector import event handoff', () => {
  it('queues a bounded MCP JSON request until Connector Center subscribes', () => {
    const detail = {
      text: '{"mcpServers":{"tapd":{}}}',
      name: 'mcp.json',
      requestId: '01234567-89ab-cdef-0123-456789abcdef',
    }
    expect(acceptConnectorImport(detail)).toBe(true)
    const listener = vi.fn()
    const dispose = subscribeConnectorImport(listener)
    expect(listener).toHaveBeenCalledWith(detail)
    consumeConnectorImport(detail.requestId)
    dispose()
  })

  it('rejects malformed and oversized renderer events', () => {
    expect(acceptConnectorImport({ text: '{}', name: '.env', requestId: 'bad' })).toBe(false)
    expect(acceptConnectorImport({
      text: 'x'.repeat(1024 * 1024 + 1),
      name: 'mcp.json',
      requestId: '01234567-89ab-cdef-0123-456789abcdef',
    })).toBe(false)
  })

  it('selects only the requested MCP server keyword and leaves unrelated entries off', () => {
    expect(selectedServerMap(['tapd_mcp_http', 'iWiki', 'ardot'], ['tapd'])).toEqual({
      tapd_mcp_http: true,
      iWiki: false,
      ardot: false,
    })
    expect(selectedServerMap(['tapd_mcp_http', 'iWiki'])).toEqual({ tapd_mcp_http: true, iWiki: true })
    expect(selectedServerMap(['tapd_mcp_http', 'iWiki'], ['missing'])).toEqual({ tapd_mcp_http: false, iWiki: false })
  })
})
