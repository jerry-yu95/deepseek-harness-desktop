import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConnectorsTab } from '../src/client/panel/ConnectorsTab.tsx'

afterEach(cleanup)

describe('connector truth and configuration access', () => {
  it('opens existing configuration and saves edits without echoing stored credentials', async () => {
    const bridge = {
      listConnectors: vi.fn().mockResolvedValue([{ id: 'fixture', name: 'Fixture', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/mcp', source: { kind: 'json' } }]),
      getConnectorConfiguration: vi.fn().mockResolvedValue({ id: 'fixture', revision: 'revision', configuration: { name: 'Fixture', url: 'https://example.com/mcp' }, credentials: [{ slot: '0', label: 'header: X-Service-Token', configured: true }] }),
      updateConnectorConfiguration: vi.fn().mockResolvedValue({}),
    }
    render(<ConnectorsTab bridge={bridge as never} refreshKey={0} notify={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '重新配置' }))
    const configuration = await screen.findByLabelText('当前配置（JSON）')
    expect((configuration as HTMLTextAreaElement).value).toContain('https://example.com/mcp')
    const credential = screen.getByLabelText(/header: X-Service-Token/)
    expect((credential as HTMLInputElement).value).toBe('')
    expect((credential as HTMLInputElement).type).toBe('password')
    fireEvent.change(configuration, { target: { value: JSON.stringify({ name: 'Updated', url: 'https://example.com/mcp' }) } })
    fireEvent.click(screen.getByRole('button', { name: '保存并重载' }))
    await waitFor(() => expect(bridge.updateConnectorConfiguration).toHaveBeenCalledWith('fixture', { revision: 'revision', configuration: { name: 'Updated', url: 'https://example.com/mcp' }, credentials: { 0: '' } }))
  })

  it('shows explicit browser authorization and cancellation for a remote connector', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const bridge = {
      listConnectors: vi.fn().mockResolvedValue([{ id: 'fixture', name: 'Fixture', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/mcp', source: { kind: 'json' } }]),
      authorizeRemoteConnector: vi.fn().mockReturnValue(new Promise(() => {})),
      cancelRemoteConnectorAuthorization: vi.fn().mockResolvedValue(undefined),
    }
    render(<ConnectorsTab bridge={bridge as never} refreshKey={0} notify={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '浏览器授权（OAuth）' }))
    expect(bridge.authorizeRemoteConnector).toHaveBeenCalledWith('fixture')
    fireEvent.click(await screen.findByRole('button', { name: '取消授权' }))
    expect(bridge.cancelRemoteConnectorAuthorization).toHaveBeenCalledWith('fixture')
    confirm.mockRestore()
  })
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

  it('keeps custom connectors visible with truthful failed health and a reconfigure action', async () => {
    const connector = {
      id: 'iwiki', name: 'iWiki', description: 'Imported MCP server', kind: 'mcp', transport: 'streamable-http',
      url: 'https://example.com/mcp', enabled: true, source: { kind: 'json' },
    }
    const bridge = {
      listConnectors: vi.fn().mockResolvedValue([connector]),
      previewMcpJson: vi.fn().mockResolvedValue({ servers: [] }), importMcpJson: vi.fn(), checkConnector: vi.fn().mockResolvedValue({
        ok: false, state: 'needs-authorization', detail: '需要完成授权后才能完成握手', checks: [
          { id: 'configuration', status: 'pass', detail: '配置结构有效' },
          { id: 'credentials', status: 'pass', detail: '无需额外凭证' },
          { id: 'runtime', status: 'warn', detail: '需要完成授权' },
          { id: 'registration', status: 'pass', detail: '已写入桌面连接器注册表' },
        ],
      }), removeConnector: vi.fn(), setConnectorEnabled: vi.fn(),
    }
    render(<ConnectorsTab bridge={bridge as never} refreshKey={0} notify={vi.fn()} />)
    expect(await screen.findByText('iWiki')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重新测试' }))
    expect(await screen.findByText('需要完成授权后才能完成握手')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新配置' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '连接诊断' })).toBeTruthy()
  })
})
