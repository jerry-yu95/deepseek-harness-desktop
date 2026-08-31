/** Shared browser/Host protocol for tool-readable local file attachments. */

// dsh-client-connection channels are one absolute path segment; RPC methods
// supply the endpoint suffix separately.
export const FILE_ATTACHMENT_RPC_CHANNEL = '/dsh-text-context-files-v1'

export interface FileUploadRequest {
  name: string
  mediaType: string
  bytes: number
  base64: string
  redacted: boolean
  kind: 'text' | 'office'
}

export interface FileAttachmentRef {
  id: string
  name: string
  mediaType: string
  bytes: number
  kind: 'text' | 'office'
  redacted: boolean
}

export interface FileUploadResponse {
  attachment: FileAttachmentRef
}

export interface ConnectorImportRequest {
  requestId: string
  attachmentId: string
  name: string
  requestedServerNames?: string[]
}
