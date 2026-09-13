import { createHash } from 'node:crypto'
import { validateConnectorInput } from './connectors.mjs'

const fields = ['name', 'description', 'url', 'command', 'args', 'cwd', 'capabilities']
const revision = connector => createHash('sha256').update(JSON.stringify(connector)).digest('hex')
const references = connector => [...new Set([
  ...(connector.secretBindings ?? []).map(binding => binding.credentialRef),
  ...(connector.secretEnvKeys ?? []),
])]

/** Never decrypt credentials for an editor response. */
export function connectorEditorDraft(connector, hasCredential = () => false) {
  return {
    id: connector.id,
    revision: revision(connector),
    configuration: Object.fromEntries(fields.filter(key => connector[key] !== undefined).map(key => [key, connector[key]])),
    credentials: references(connector).map((reference, index) => ({
      slot: String(index),
      label: (connector.secretBindings ?? []).filter(binding => binding.credentialRef === reference).map(binding => `${binding.location}: ${binding.targetKey}`).join(', ') || reference,
      configured: hasCredential(reference),
    })),
  }
}

export function prepareConnectorEdit(connector, input) {
  if (!input || input.revision !== revision(connector)) throw new Error('connector-edit-stale')
  const configuration = input.configuration
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)
    || Object.keys(configuration).some(key => !fields.includes(key))) throw new Error('connector-edit-invalid')
  const replacements = input.credentials ?? {}
  const refs = references(connector)
  if (!replacements || typeof replacements !== 'object' || Array.isArray(replacements)
    || Object.keys(replacements).some(key => !refs.some((_, index) => String(index) === key))) throw new Error('connector-edit-invalid')
  const credentials = new Map()
  for (const [slot, value] of Object.entries(replacements)) {
    if (typeof value !== 'string' || value.length > 8192) throw new Error('connector-edit-invalid')
    if (value.length) {
      const ref = refs[Number(slot)]
      if (!/^DSH_CONNECTOR_[A-Z0-9_]+$/u.test(ref)) throw new Error('connector-edit-environment-managed')
      credentials.set(ref, value)
    }
  }
  let updated
  try { updated = validateConnectorInput({ ...connector, ...configuration }) } catch { throw new Error('connector-edit-invalid') }
  const destinationChanged = ['url', 'command', 'args', 'cwd'].some(key => JSON.stringify(updated[key]) !== JSON.stringify(connector[key]))
  if (destinationChanged && refs.some(ref => !credentials.has(ref))) throw new Error('connector-edit-reenter-credentials')
  if (destinationChanged && connector.source?.kind === 'provider-json') {
    updated.source = { ...connector.source, configurationHash: revision(updated), capturedAt: new Date().toISOString() }
  }
  return { connector: updated, credentials }
}
