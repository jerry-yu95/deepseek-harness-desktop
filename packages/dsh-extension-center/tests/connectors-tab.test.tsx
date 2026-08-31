import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConnectorsTab } from '../src/client/panel/ConnectorsTab.tsx'

afterEach(cleanup)

describe('connector truth and configuration access', () => {
  it('labels provider JSON as configured and lets users reopen its configuration', async () => {
    const connector = {
      id: 'tapd-mcp-http', name: 'tapd_mcp_http', description: 'Imported MCP server', kind: 'mcp', transport: 'streamable-http',
      url: 'https://mcp.example.com/mcp/', enabled: true,
      source: { kind: 'provider-json', providerId: 'tapd', configurationHash: 'a'.repeat(64), capturedAt: '2026-08-31T00:00:00.000Z' },
    }
    const bridge = {
      listConnectors: vi.fn().mockResolvedValue([connector]),
      previewMcpJson: vi.fn(), importMcpJson: vi.fn(), checkConnector: vi.fn(), removeConnector: vi.fn(), setConnectorEnabled: vi.fn(),
    }
    render(<ConnectorsTab bridge={bridge as never} refreshKey={0} notify={vi.fn()} />)
    expect(await screen.findByText('已配置')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重新配置' }))
    expect(await screen.findByRole('heading', { name: '导入官方 MCP 配置' })).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByLabelText('MCP JSON')).toBeTruthy()
  })
})
