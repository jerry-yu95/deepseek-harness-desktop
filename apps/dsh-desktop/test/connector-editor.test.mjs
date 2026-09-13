import assert from 'node:assert/strict'
import test from 'node:test'
import { connectorEditorDraft, prepareConnectorEdit } from '../src/extensions/connector-editor.mjs'
import { validateConnectorInput } from '../src/extensions/connectors.mjs'

const connector = validateConnectorInput({
  id: 'fixture', name: 'Fixture', kind: 'mcp', transport: 'streamable-http', url: 'https://example.com/mcp',
  secretBindings: [{ location: 'header', targetKey: 'X-Service-Token', credentialRef: 'DSH_CONNECTOR_FIXTURE', template: '${secret}' }],
  source: { kind: 'json' },
})

test('editor exposes configuration and credential presence only', () => {
  const draft = connectorEditorDraft(connector, () => true)
  assert.equal(draft.configuration.url, connector.url)
  assert.equal(draft.credentials[0].configured, true)
  assert.equal(draft.credentials[0].label, 'header: X-Service-Token')
  assert.doesNotMatch(JSON.stringify(draft), /DSH_CONNECTOR_FIXTURE/)
})

test('editing metadata preserves identity, provenance and credential bindings', () => {
  const draft = connectorEditorDraft(connector)
  const result = prepareConnectorEdit(connector, { ...draft, configuration: { ...draft.configuration, name: 'Updated' }, credentials: { 0: '' } })
  assert.equal(result.connector.name, 'Updated')
  assert.deepEqual(result.connector.secretBindings, connector.secretBindings)
  assert.deepEqual(result.connector.source, connector.source)
  assert.equal(result.credentials.size, 0)
})

test('destination changes cannot silently reuse stored credentials', () => {
  const draft = connectorEditorDraft(connector)
  const input = { ...draft, configuration: { ...draft.configuration, url: 'https://other.example.com/mcp' }, credentials: {} }
  assert.throws(() => prepareConnectorEdit(connector, input), /reenter-credentials/)
  const result = prepareConnectorEdit(connector, { ...input, credentials: { 0: 'synthetic-replacement' } })
  assert.equal(result.credentials.get('DSH_CONNECTOR_FIXTURE'), 'synthetic-replacement')
})

test('editor rejects stale configuration, injected references and unknown slots', () => {
  const draft = connectorEditorDraft(connector)
  assert.throws(() => prepareConnectorEdit({ ...connector, name: 'Changed' }, draft), /stale/)
  assert.throws(() => prepareConnectorEdit(connector, { ...draft, configuration: { secretBindings: [] } }), /invalid/)
  assert.throws(() => prepareConnectorEdit(connector, { ...draft, credentials: { 9: 'synthetic' } }), /invalid/)
})
