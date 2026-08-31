import { describe, expect, it } from 'vitest'

import { classifyFile, fenceLanguage } from '../src/core/classify.ts'

describe('classifyFile', () => {
  it('treats application/json as text even when the name is unusual', () => {
    const result = classifyFile({ name: 'mcp.json', type: 'application/json', size: 12 })
    expect(result).toEqual({
      kind: 'text',
      syntax: 'json',
      mime: 'application/json',
      basename: 'mcp.json',
    })
  })

  it('falls back to the .json extension when MIME is empty', () => {
    const result = classifyFile({ name: 'config.json', type: '', size: 2 })
    expect(result.kind).toBe('text')
    if (result.kind === 'text') {
      expect(result.syntax).toBe('json')
      expect(result.basename).toBe('config.json')
    }
  })

  it('recovers a JSON filename incorrectly reported as an image by the desktop bridge', () => {
    const result = classifyFile({ name: 'mcp.json', type: 'image/png', size: 24 })
    expect(result).toEqual({
      kind: 'text',
      syntax: 'json',
      mime: 'application/json',
      basename: 'mcp.json',
    })
  })

  it('does not use the extension when MIME is present and unsupported', () => {
    const result = classifyFile({ name: 'notes.json', type: 'application/pdf', size: 8 })
    expect(result).toEqual({ kind: 'unsupported' })
  })

  it('passes official image MIME types through when the filename is not a safe text type', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(classifyFile({ name: 'pic.bin', type, size: 4 })).toEqual({ kind: 'image' })
    }
  })

  it('passes empty-MIME png/jpeg/webp/gif extensions through to the official image path', () => {
    expect(classifyFile({ name: 'shot.png', type: '', size: 4 })).toEqual({ kind: 'image' })
  })

  it('rejects PDF and ZIP', () => {
    expect(classifyFile({ name: 'doc.pdf', type: 'application/pdf', size: 20 })).toEqual({ kind: 'unsupported' })
    expect(classifyFile({ name: 'archive.zip', type: 'application/zip', size: 20 })).toEqual({ kind: 'unsupported' })
    expect(classifyFile({ name: 'archive.zip', type: '', size: 20 })).toEqual({ kind: 'unsupported' })
  })

  it('accepts modern Office documents but keeps legacy binary Office blocked', () => {
    expect(classifyFile({ name: 'brief.docx', type: '', size: 20 }).kind).toBe('office')
    expect(classifyFile({ name: 'table.xlsx', type: 'application/octet-stream', size: 20 }).kind).toBe('office')
    expect(classifyFile({
      name: 'deck.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size: 20,
    }).kind).toBe('office')
    expect(classifyFile({ name: 'legacy.doc', type: 'application/msword', size: 20 })).toEqual({ kind: 'unsupported' })
  })

  it('keeps only the basename and never surfaces a directory', () => {
    const result = classifyFile({ name: '/Users/demo/secrets/mcp.json', type: 'application/json', size: 2 })
    expect(result.kind).toBe('text')
    if (result.kind === 'text') expect(result.basename).toBe('mcp.json')
  })

  it('rejects credential-shaped basenames even when MIME is text or json', () => {
    const names = [
      '.env',
      '.env.local',
      '.env.production',
      'credentials.txt',
      'private.key',
      'id_rsa',
      'id_ed25519',
      '.npmrc',
      'config.pem',
      'client-secrets.json',
    ]
    for (const name of names) {
      const mime = name.endsWith('.json') ? 'application/json' : 'text/plain'
      const result = classifyFile({ name, type: mime, size: 8 })
      expect(result.kind).toBe('sensitive-file')
    }
  })

  it('still allows mcp.json, settings.json, and config.json', () => {
    for (const name of ['mcp.json', 'settings.json', 'config.json']) {
      const result = classifyFile({ name, type: 'application/json', size: 2 })
      expect(result.kind).toBe('text')
    }
  })

  it('maps fence languages from syntax', () => {
    expect(fenceLanguage('json')).toBe('json')
    expect(fenceLanguage('jsonc')).toBe('json')
    expect(fenceLanguage('yaml')).toBe('yaml')
    expect(fenceLanguage('markdown')).toBe('markdown')
    expect(fenceLanguage('xml')).toBe('xml')
    expect(fenceLanguage('csv')).toBe('csv')
    expect(fenceLanguage('text')).toBe('text')
  })
})
