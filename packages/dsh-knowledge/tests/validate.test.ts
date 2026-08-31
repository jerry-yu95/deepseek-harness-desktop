import { describe, expect, it } from 'vitest'

import { normalizeProposal, validateKnowledgeItem } from '../src/core/validate.ts'

const NOW = '2026-08-31T08:00:00.000Z'
const ID = 'knowledge_0123456789abcdef0123456789abcdef'

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'lesson',
    title: '先验证工具链再扩大实现范围',
    content: '附件、连接器和模型能力要拆成独立链路验证，避免用一个开关掩盖另一个问题。',
    project: 'dsh-design-desktop',
    tags: ['Harness', '验证', 'harness'],
    confidence: 0.86,
    source: { kind: 'conversation', label: '附件与连接器排查', sessionId: 'session-1' },
    ...overrides,
  }
}

describe('knowledge proposal validation', () => {
  it('normalizes a valid candidate and preserves required provenance', () => {
    expect(normalizeProposal(proposal(), { id: ID, now: NOW })).toEqual({
      id: ID,
      status: 'candidate',
      kind: 'lesson',
      title: '先验证工具链再扩大实现范围',
      content: '附件、连接器和模型能力要拆成独立链路验证，避免用一个开关掩盖另一个问题。',
      project: 'dsh-design-desktop',
      tags: ['Harness', '验证'],
      confidence: 0.86,
      source: { kind: 'conversation', label: '附件与连接器排查', sessionId: 'session-1', capturedAt: NOW },
      createdAt: NOW,
      updatedAt: NOW,
    })
  })

  it('rejects missing or invalid provenance', () => {
    expect(() => normalizeProposal(proposal({ source: undefined }), { id: ID, now: NOW })).toThrow(/source/u)
    expect(() => normalizeProposal(proposal({ source: { kind: 'hidden-reasoning', label: 'trace' } }), { id: ID, now: NOW })).toThrow(/source kind/u)
    expect(() => normalizeProposal(proposal({ source: { kind: 'conversation', label: '  ' } }), { id: ID, now: NOW })).toThrow(/source label/u)
  })

  it('rejects unsupported kinds and invalid confidence', () => {
    expect(() => normalizeProposal(proposal({ kind: 'transcript' }), { id: ID, now: NOW })).toThrow(/kind/u)
    expect(() => normalizeProposal(proposal({ confidence: 1.1 }), { id: ID, now: NOW })).toThrow(/confidence/u)
  })

  it('bounds content and tags without accepting transcript dumps', () => {
    expect(() => normalizeProposal(proposal({ title: 'x'.repeat(161) }), { id: ID, now: NOW })).toThrow(/title/u)
    expect(() => normalizeProposal(proposal({ content: 'x'.repeat(4001) }), { id: ID, now: NOW })).toThrow(/content/u)
    expect(() => normalizeProposal(proposal({ tags: Array.from({ length: 9 }, (_, index) => `tag-${index}`) }), { id: ID, now: NOW })).toThrow(/tags/u)
    expect(() => normalizeProposal(proposal({ tags: ['safe', '../escape'] }), { id: ID, now: NOW })).toThrow(/tag/u)
  })

  it('rejects caller-controlled lifecycle fields and secret-shaped content', () => {
    expect(() => normalizeProposal(proposal({ status: 'confirmed' }), { id: ID, now: NOW })).toThrow(/reserved/u)
    expect(() => normalizeProposal(proposal({ confirmedAt: NOW }), { id: ID, now: NOW })).toThrow(/reserved/u)
    expect(() => normalizeProposal(proposal({ content: 'Authorization: Bearer test-secret-value-1234567890' }), { id: ID, now: NOW })).toThrow(/secret/u)
  })

  it('validates stored records and rejects impossible lifecycle combinations', () => {
    const item = normalizeProposal(proposal(), { id: ID, now: NOW })
    expect(validateKnowledgeItem(item)).toEqual(item)
    expect(() => validateKnowledgeItem({ ...item, status: 'confirmed' })).toThrow(/confirmedAt/u)
    expect(() => validateKnowledgeItem({ ...item, id: '../escape' })).toThrow(/id/u)
  })
})
