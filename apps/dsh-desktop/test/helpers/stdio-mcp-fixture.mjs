import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new McpServer({ name: 'fixture', version: '1' })
server.registerTool('fixture_lookup', { description: 'Synthetic test tool' }, async () => ({ content: [{ type: 'text', text: 'fixture' }] }))
await server.connect(new StdioServerTransport())
