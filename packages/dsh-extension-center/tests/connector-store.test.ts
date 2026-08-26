import { describe, expect, it } from 'vitest'
import {
  CONNECTOR_STORE_ENTRIES,
  filterConnectorStore,
  validateConnectorStore,
  validateConnectorStoreEntry,
} from '../src/client/connector-store.ts'

describe('connector store manifest', () => {
  it('ships a validated built-in manifest with evidence-first experimental defaults', () => {
    expect(CONNECTOR_STORE_ENTRIES.length).toBeGreaterThanOrEqual(8)
    expect(new Set(CONNECTOR_STORE_ENTRIES.map((entry) => entry.id)).size).toBe(CONNECTOR_STORE_ENTRIES.length)
    expect(CONNECTOR_STORE_ENTRIES.every((entry) => entry.tier === 'experimental' && entry.liveVerified === false)).toBe(true)
  })

  it('rejects unsupported URLs, missing evidence and duplicate ids', () => {
    const base = CONNECTOR_STORE_ENTRIES[0]
    expect(() => validateConnectorStoreEntry({ ...base, sourceUrl: 'http://example.com' })).toThrow(/HTTPS/u)
    expect(() => validateConnectorStoreEntry({ ...base, tier: 'verified', liveVerified: false })).toThrow(/live evidence/u)
    expect(() => validateConnectorStore([{ ...base }, { ...base }])).toThrow(/duplicate/u)
  })

  it('requires a license for community entries and disallows false experimental evidence', () => {
    const base = CONNECTOR_STORE_ENTRIES[0]
    expect(() => validateConnectorStoreEntry({ ...base, tier: 'community', license: undefined })).toThrow(/license/u)
    expect(() => validateConnectorStoreEntry({ ...base, tier: 'experimental', liveVerified: true })).toThrow(/live verification/u)
  })

  it('filters by keyword, tier, auth mode and installed state', () => {
    const installed = new Set(['github'])
    expect(filterConnectorStore(CONNECTOR_STORE_ENTRIES, { keyword: 'github' }, installed).map((entry) => entry.id)).toEqual(['github'])
    expect(filterConnectorStore(CONNECTOR_STORE_ENTRIES, { tier: 'experimental', authMode: 'oauth' }, installed).every((entry) => entry.authModes.includes('oauth'))).toBe(true)
    expect(filterConnectorStore(CONNECTOR_STORE_ENTRIES, { installed: true }, installed).map((entry) => entry.id)).toEqual(['github'])
    expect(filterConnectorStore(CONNECTOR_STORE_ENTRIES, { installed: false }, installed).some((entry) => entry.id === 'github')).toBe(false)
  })
})
