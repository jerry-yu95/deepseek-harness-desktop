import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { FILE_ATTACHMENT_RPC_CHANNEL, type ConnectorImportRequest, type FileAttachmentRef, type FileUploadRequest, type FileUploadResponse } from '../wire.ts'

export interface FileAttachmentUploader {
  upload(input: FileUploadRequest, signal?: AbortSignal): Promise<FileAttachmentRef>
}

export class TextContextClientApi implements FileAttachmentUploader {
  constructor(private readonly connection: ConnectionHandle) {}

  async upload(input: FileUploadRequest, signal?: AbortSignal): Promise<FileAttachmentRef> {
    const result = await this.connection.rpc.call(FILE_ATTACHMENT_RPC_CHANNEL, 'upload', input, signal)
    if (!result.ok) throw new Error(result.error.message)
    const value = result.value as FileUploadResponse | { error: string }
    if ('error' in value) throw new Error(value.error)
    return value.attachment
  }

  async takeConnectorImport(signal?: AbortSignal): Promise<ConnectorImportRequest | undefined> {
    const result = await this.connection.rpc.call(FILE_ATTACHMENT_RPC_CHANNEL, 'take-connector-import', {}, signal)
    if (!result.ok) throw new Error(result.error.message)
    const value = result.value as { request?: ConnectorImportRequest; error?: string }
    if (value.error !== undefined) throw new Error(value.error)
    return value.request
  }
}
