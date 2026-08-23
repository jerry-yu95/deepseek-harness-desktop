/**
 * Bridge-layer unit tests: availability probing and the pure form mappers.
 * No DOM, no network — window is stubbed where needed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildConnectorInput,
  buildSkillInput,
  canPreviewMcpClientSource,
  connectorEndpoint,
  mcpCredentialLabel,
  missingMcpCredentials,
  selectedMcpServerNames,
  getDesktopBridge,
  splitComma,
  splitLines,
  type DesktopBridge,
} from '../src/client/bridge.ts'

function stubBridge(): DesktopBridge {
  return {
    listExtensions: async () => ({ skills: [] }),
    importSkill: async () => ({ canceled: true }),
    createSkill: async (input) => ({ name: input.name }),
    openSkill: async () => undefined,
    openSkillRoot: async () => undefined,
    listConnectors: async () => [],
    saveConnector: async (input) => input as never,
    removeConnector: async () => undefined,
    checkConnector: async () => ({ ok: true, detail: 'ok' }),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('splitComma', () => {
  it('trims and drops empties', () => {
    expect(splitComma(' a, b ,, c ')).toEqual(['a', 'b', 'c'])
  })

  it('tolerates nullish and non-strings', () => {
    expect(splitComma(undefined)).toEqual([])
    expect(splitComma(null)).toEqual([])
    expect(splitComma(42)).toEqual(['42'])
  })
})

describe('splitLines', () => {
  it('splits CRLF and LF, trims, drops empties', () => {
    expect(splitLines('-y\r\n@example/mcp\n\n  --verbose ')).toEqual(['-y', '@example/mcp', '--verbose'])
  })
})

describe('buildSkillInput', () => {
  it('trims fields and omits empty examples', () => {
    expect(buildSkillInput({ name: ' tapd-workflow ', description: ' d ', instructions: ' i ', examples: '   ' }))
      .toEqual({ name: 'tapd-workflow', description: 'd', instructions: 'i' })
  })

  it('keeps non-empty examples', () => {
    const input = buildSkillInput({ name: 'n', description: 'd', instructions: 'i', examples: ' ex ' })
    expect(input.examples).toBe('ex')
  })
})

describe('buildConnectorInput', () => {
  it('maps an MCP stdio form to command plus parsed args', () => {
    const input = buildConnectorInput({
      id: ' my-tapd ',
      name: ' TAPD ',
      description: '',
      kind: 'mcp',
      transport: 'stdio',
      command: ' npx ',
      args: '-y\n@example/mcp\n',
      capabilities: 'search, read',
      secretEnvKeys: 'TAPD_TOKEN,',
    })
    expect(input).toEqual({
      id: 'my-tapd',
      name: 'TAPD',
      description: '',
      capabilities: ['search', 'read'],
      secretEnvKeys: ['TAPD_TOKEN'],
      enabled: true,
      kind: 'mcp',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@example/mcp'],
    })
  })

  it('maps an MCP streamable-http form to a URL without command fields', () => {
    const input = buildConnectorInput({ id: 'feishu', name: 'Feishu', kind: 'mcp', transport: 'streamable-http', url: ' https://mcp.example ' })
    expect(input.kind).toBe('mcp')
    expect(input.transport).toBe('streamable-http')
    expect(input.url).toBe('https://mcp.example')
    expect(input.command).toBeUndefined()
    expect(input.args).toBeUndefined()
  })

  it('maps an HTTP form to transport http with a URL', () => {
    const input = buildConnectorInput({ id: 'api', name: 'API', kind: 'http', transport: 'stdio', url: 'https://api.example' })
    expect(input.kind).toBe('http')
    expect(input.transport).toBe('http')
    expect(input.url).toBe('https://api.example')
    expect(input.command).toBeUndefined()
  })
})

describe('connectorEndpoint', () => {
  it('joins the stdio command line', () => {
    expect(connectorEndpoint({ kind: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', '@example/mcp'] }))
      .toBe('npx -y @example/mcp')
  })

  it('returns the URL for remote transports', () => {
    expect(connectorEndpoint({ kind: 'mcp', transport: 'streamable-http', url: 'https://mcp.example' })).toBe('https://mcp.example')
    expect(connectorEndpoint({ kind: 'http', transport: 'http', url: 'https://api.example' })).toBe('https://api.example')
  })
})

describe('MCP onboarding helpers', () => {
  const preview = {
    servers: [
      {
        sourceName: 'github',
        suggestedId: 'github',
        transport: 'streamable-http' as const,
        url: 'https://api.githubcopilot.com/mcp/',
        plainEnv: {},
        plainHeaders: {},
        secretSlots: [
          {
            location: 'header' as const,
            targetKey: 'Authorization',
            credentialRef: 'DSH_CONNECTOR_GITHUB_AUTHORIZATION',
            template: 'Bearer ${secret}' as const,
            placeholder: 'GITHUB_PERSONAL_ACCESS_TOKEN',
            detected: false,
          },
        ],
      },
      {
        sourceName: 'docs',
        suggestedId: 'docs',
        transport: 'streamable-http' as const,
        url: 'https://example.com/mcp',
        plainEnv: {},
        plainHeaders: {},
        secretSlots: [
          {
            location: 'header' as const,
            targetKey: 'Authorization',
            credentialRef: 'DSH_CONNECTOR_GITHUB_AUTHORIZATION',
            template: 'Bearer ${secret}' as const,
            detected: false,
          },
        ],
      },
    ],
  }

  it('keeps selection order and shows provider-facing credential labels', () => {
    expect(selectedMcpServerNames(preview, { github: true, docs: false })).toEqual(['github'])
    expect(mcpCredentialLabel(preview.servers[0].secretSlots[0])).toBe('GITHUB_PERSONAL_ACCESS_TOKEN')
  })

  it('reports one missing credential for duplicate secure references', () => {
    expect(missingMcpCredentials(preview, { github: true, docs: true }, {})).toHaveLength(1)
    expect(missingMcpCredentials(preview, { github: true, docs: true }, {
      DSH_CONNECTOR_GITHUB_AUTHORIZATION: 'token',
    })).toEqual([])
  })

  it('only auto-previews a verified external client source', () => {
    const source = {
      clientId: 'codebuddy',
      clientName: 'CodeBuddy',
      serverCount: 1,
      scope: 'user' as const,
    }
    expect(canPreviewMcpClientSource({ ...source, status: 'available' })).toBe(true)
    expect(canPreviewMcpClientSource({ ...source, status: 'empty' })).toBe(false)
    expect(canPreviewMcpClientSource({ ...source, status: 'not-found' })).toBe(false)
    expect(canPreviewMcpClientSource({ ...source, status: 'invalid' })).toBe(false)
    expect(canPreviewMcpClientSource({ ...source, status: 'manual' })).toBe(false)
  })
})

describe('getDesktopBridge', () => {
  it('returns undefined without window (plain node context)', () => {
    expect(getDesktopBridge()).toBeUndefined()
  })

  it('returns undefined when dshDesktop is absent', () => {
    vi.stubGlobal('window', {})
    expect(getDesktopBridge()).toBeUndefined()
  })

  it('returns undefined when the bridge is incomplete (older desktop)', () => {
    vi.stubGlobal('window', { dshDesktop: { listConnectors: async () => [] } })
    expect(getDesktopBridge()).toBeUndefined()
  })

  it('returns the typed bridge when every required method exists', () => {
    const bridge = stubBridge()
    vi.stubGlobal('window', { dshDesktop: bridge })
    expect(getDesktopBridge()).toBe(bridge)
  })

  it('never throws on non-object dshDesktop values', () => {
    vi.stubGlobal('window', { dshDesktop: 'nope' })
    expect(getDesktopBridge()).toBeUndefined()
  })
})
