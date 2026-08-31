/**
 * Browser-half entry for the text-context plugin — runs inside the dsh web GUI.
 *
 * Listens on document capture for paste/drop, intercepts supported text files,
 * redacts credential-like fields, and inserts native file references into the
 * visible session composer. Official image MIME types are never intercepted.
 *
 * Export discipline: the /client surface carries what cordis loading needs
 * plus types only — value helpers stay in sibling modules.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { TextContextClientApi } from './api.ts'
import { installConnectorImportBridge, rememberConnectorImportSource } from './connector-import.ts'
import { installTextContextCapture, isMobileRemoteSurface } from './intake.ts'
import { dictionaryFor } from './locales.ts'
import { createFileReferenceSource, insertFileReference } from './reference.ts'

export const inject = ['connection', 'sessions', 'inputTriggers', 'conversation'] as const

/**
 * Register capture listeners for the page lifetime.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  if (isMobileRemoteSurface()) return
  const api = new TextContextClientApi(ctx.get('connection') as unknown as ConnectionHandle)
  const dictionary = dictionaryFor(document.documentElement.lang)
  ctx.effect(
    () => ctx.inputTriggers.registerSource(createFileReferenceSource(dictionary)),
    'dsh-text-context: native file reference source',
  )
  ctx.effect(
    () => installTextContextCapture({
      uploader: api,
      attachmentInserter: (composer, attachment) => insertFileReference(ctx as never, composer, attachment),
      connectorImportSource: rememberConnectorImportSource,
    }),
    'dsh-text-context: capture listeners',
  )
  ctx.effect(
    () => installConnectorImportBridge(api),
    'dsh-text-context: connector import handoff',
  )
}
