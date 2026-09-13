import type { IncomingMessage, ServerResponse } from 'node:http'
export interface LocalRpcContext {
  webServer: { register(route: { kind: 'prefix'; path: string; handler(req: IncomingMessage, res: ServerResponse): Promise<void> }): () => void }
  connection: { requestRejection(req: IncomingMessage): number | undefined }
}
export declare function registerLocalRpc(ctx: LocalRpcContext, channel: string, handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>): () => void
export declare function isLocalRequest(req: IncomingMessage): boolean
