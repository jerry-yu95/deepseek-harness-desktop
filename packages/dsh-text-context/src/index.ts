/** Host storage, RPC, tool, and prompt guidance for local file references. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import { randomUUID } from 'node:crypto'
import { FileAttachmentStore } from './core/store.ts'
import { FILE_ATTACHMENT_RPC_CHANNEL, type ConnectorImportRequest, type FileUploadRequest } from './wire.ts'

export const name = 'text-context'
export const inject = ['connection', 'tools', 'systemPrompt']

export function apply(ctx: Context): void {
  const store = new FileAttachmentStore()
  const connectorImports: Array<ConnectorImportRequest & { createdAt: number }> = []
  ctx.effect(() => ctx.connection.rpc.handle(FILE_ATTACHMENT_RPC_CHANNEL, async (endpoint, payload) => {
    try {
      if (endpoint === 'upload') {
        const attachment = await store.save(payload as FileUploadRequest)
        return { ok: true, value: { attachment } }
      }
      if (endpoint === 'take-connector-import') {
        pruneConnectorImports(connectorImports)
        const request = connectorImports.shift()
        return { ok: true, value: request === undefined ? {} : { request: stripCreatedAt(request) } }
      }
      return { ok: true, value: { error: 'unknown-endpoint' } }
    } catch (error) {
      return { ok: true, value: { error: safeError(error) } }
    }
  }, { authority: 'loopback' }), 'dsh-text-context: file upload rpc')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'attachment_read',
    description: 'Read a local file attachment referenced in the user message. Supports bounded UTF-8 text plus docx/xlsx/pptx text extraction. Select by file name, or omit both selectors to read the newest attachment. Use startLine/maxLines for paging.',
    parameters: {
      attachmentId: { type: 'string', description: 'Optional opaque file_* id returned by a previous tool result.' },
      name: { type: 'string', description: 'Optional visible attachment file name. The newest matching attachment is used.' },
      startLine: { type: 'integer', description: 'First 1-based extracted text line. Defaults to 1.' },
      maxLines: { type: 'integer', description: 'Number of lines to return, 1-500. Defaults to 200.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderReadResult(value as unknown as Awaited<ReturnType<FileAttachmentStore['read']>>) }],
    },
    execute: async args => await store.readSelected({ attachmentId: args.attachmentId, name: args.name }, { startLine: args.startLine, maxLines: args.maxLines }) as unknown as Record<string, JsonValue>,
  })), 'dsh-text-context: attachment_read tool')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'connector_import_prepare',
    description: 'Prepare an attached MCP JSON configuration for the desktop Connector Center. Use this immediately when the user asks to add, configure, or import MCP servers from an attached mcp.json. If the user names specific servers, pass those names or keywords in requestedServerNames so only matching entries are selected. Select by file name, or omit both selectors for the newest attachment. This opens the controlled preview flow; do not search settings files, app.asar, node_modules, web endpoints, or credentials first.',
    parameters: {
      attachmentId: { type: 'string', description: 'Optional opaque file_* id returned by a previous tool result.' },
      name: { type: 'string', description: 'Optional visible attachment file name.' },
      requestedServerNames: { type: 'array', items: { type: 'string' }, description: 'Optional MCP server names or distinctive keywords explicitly requested by the user, for example ["tapd"].' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderConnectorImportResult(value as { prepared: boolean; name: string }) }],
    },
    execute: async (args, exec) => {
      const read = await store.readSelected({ attachmentId: args.attachmentId, name: args.name }, { startLine: 1, maxLines: 500 })
      if (read.truncated) throw new Error('MCP configuration is too large to validate safely')
      assertMcpDocument(read.attachment.name, read.text)
      pruneConnectorImports(connectorImports)
      connectorImports.push({
        requestId: randomUUID(),
        attachmentId: read.attachment.id,
        name: read.attachment.name,
        ...normalizeRequestedServerNames(args.requestedServerNames),
        createdAt: Date.now(),
      })
      exec.concludeTurn()
      return { prepared: true, name: read.attachment.name }
    },
  })), 'dsh-text-context: connector_import_prepare tool')

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:file-attachments',
    order: 145,
    text: 'Messages may contain a plain “File attachment: <name>” marker. It is a local file reference, not file content. Use attachment_read with the visible name, or omit selectors for the newest attachment. When the user asks to add or configure MCP from an attached JSON file, call connector_import_prepare immediately; if the user names one or more target servers, include those names or distinctive keywords in requestedServerNames so unrelated entries are not selected. Do not search settings.yaml, app.asar, node_modules, user client configs, or provider web APIs. The desktop then opens a controlled Connector Center preview and the turn must end. Text configuration files exposed to the model are redacted; hidden credentials are available only to the encrypted connector runtime. Never ask the user to paste tokens or cookies into chat, and never use Bash, curl, Search, or browser probing as a substitute for an MCP connector. If a saved connector has no registered MCP tools, report its Connector Center diagnostic instead. Images continue through the native image attachment path.',
  }), 'dsh-text-context: agent guidance')
}

function assertMcpDocument(name: string, text: string): void {
  if (!/\.jsonc?$/iu.test(name)) throw new Error('only MCP JSON attachments can be prepared for Connector Center')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('MCP attachment is not valid JSON')
  }
  const servers = (value as { mcpServers?: unknown } | null)?.mcpServers
  if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) throw new Error('MCP attachment must contain an mcpServers object')
}

function pruneConnectorImports(queue: Array<ConnectorImportRequest & { createdAt: number }>): void {
  const cutoff = Date.now() - 15 * 60 * 1_000
  while (queue.length > 0 && queue[0].createdAt < cutoff) queue.shift()
  if (queue.length > 8) queue.splice(0, queue.length - 8)
}

function stripCreatedAt(request: ConnectorImportRequest & { createdAt: number }): ConnectorImportRequest {
  const { requestId, attachmentId, name, requestedServerNames } = request
  return { requestId, attachmentId, name, ...(requestedServerNames === undefined ? {} : { requestedServerNames }) }
}

function normalizeRequestedServerNames(value: unknown): Pick<ConnectorImportRequest, 'requestedServerNames'> {
  if (value === undefined) return {}
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) throw new TypeError('requestedServerNames must contain 1-16 server names')
  const names = [...new Set(value.map((item) => {
    if (typeof item !== 'string') throw new TypeError('requestedServerNames must contain strings')
    const name = item.trim()
    if (name.length === 0 || name.length > 128 || /[\u0000-\u001f\u007f]/u.test(name)) throw new TypeError('requested server name is invalid')
    return name
  }))]
  return { requestedServerNames: names }
}

function renderConnectorImportResult(value: { prepared: boolean; name: string }): string {
  return value.prepared
    ? `${value.name} is ready in Connector Center. Review the detected servers and credentials, then confirm Save and connect.`
    : 'Connector import could not be prepared.'
}

function renderReadResult(value: Awaited<ReturnType<FileAttachmentStore['read']>>): string {
  const header = `${value.attachment.name} (${value.attachment.mediaType}, ${value.attachment.bytes} bytes${value.attachment.redacted ? ', redacted' : ''})`
  const range = `lines ${value.startLine}-${value.endLine} of ${value.totalLines}${value.truncated ? '; more available' : ''}`
  const nextAction = /"mcpServers"\s*:/u.test(value.text)
    ? `\n\nMCP configuration detected. If the user asked to configure or import it, call connector_import_prepare with attachmentId ${value.attachment.id} now; do not inspect application internals.`
    : ''
  return `${header}\n${range}\n\n${value.text}${nextAction}`
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'attachment operation failed'
  return message.replace(/(authorization|api[_-]?key|token|secret)\s*[:=]\s*\S+/giu, '$1=<REDACTED>').slice(0, 300)
}
