import { describe, expect, it } from 'vitest'

import { CONNECTOR_PRESETS } from '../src/client/catalog.ts'

describe('verified connector catalog', () => {
  it('uses unique IDs and HTTPS official documentation links', () => {
    expect(new Set(CONNECTOR_PRESETS.map((preset) => preset.id)).size).toBe(CONNECTOR_PRESETS.length)
    for (const preset of CONNECTOR_PRESETS) {
      expect(preset.docsUrl).toMatch(/^https:\/\//u)
      expect(preset.capabilities.length).toBeGreaterThan(0)
      expect(['official-mcp', 'provider-config', 'official-skill', 'official-api']).toContain(preset.documentation)
    }
  })

  it('only gives importable MCP templates to verified template entries', () => {
    for (const preset of CONNECTOR_PRESETS) {
      if (preset.integration === 'mcp-template') {
        expect(preset.json).toContain('"mcpServers"')
      } else {
        expect(preset.json).toBeUndefined()
      }
    }
  })

  it('keeps TAPD and Tencent Gongfeng provider-managed instead of inventing endpoints', () => {
    expect(CONNECTOR_PRESETS.find((preset) => preset.id === 'tapd')?.integration).toBe('provider-json')
    expect(CONNECTOR_PRESETS.find((preset) => preset.id === 'tencent-gongfeng')?.integration).toBe('provider-json')
    expect(CONNECTOR_PRESETS.find((preset) => preset.id === 'tencent-gongfeng')?.documentation).toBe('official-api')
  })

  it('describes GitHub and GitLab authorization without embedding credentials', () => {
    const github = CONNECTOR_PRESETS.find((preset) => preset.id === 'github')
    const gitlab = CONNECTOR_PRESETS.find((preset) => preset.id === 'gitlab')
    expect(github?.authModes).toEqual(['oauth', 'pat'])
    expect(github?.authScopes).toEqual(['repo', 'read:user', 'user:email'])
    expect(gitlab?.authModes).toEqual(['oauth'])
    expect(gitlab?.authScopes).toEqual(['mcp'])
    for (const preset of [github, gitlab]) {
      expect(JSON.stringify(preset)).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,}/u)
    }
  })

  it('describes Feishu official CLI and keeps DingTalk defaults read-only', () => {
    const feishu = CONNECTOR_PRESETS.find((preset) => preset.id === 'feishu')
    const dingtalk = CONNECTOR_PRESETS.find((preset) => preset.id === 'dingtalk')
    expect(feishu?.authModes).toEqual(['official-cli', 'app-credentials'])
    expect(feishu?.authScopes).toEqual(['offline_access'])
    expect(dingtalk?.authModes).toEqual(['app-credentials'])
    expect(dingtalk?.authScopes).toEqual(['dingtalk-contacts'])
    expect(dingtalk?.json).toContain('DINGTALK_Client_ID')
    expect(dingtalk?.json).toContain('DINGTALK_Client_Secret')
    expect(dingtalk?.json).toContain('ACTIVE_PROFILES')
    expect(dingtalk?.json).toContain('dingtalk-contacts')
    expect(dingtalk?.json).not.toContain('dingtalk-robot-send-message')
  })

  it('points each verified entry at the provider-owned documentation host', () => {
    const expectedHosts: Record<string, string> = {
      github: 'github.com',
      feishu: 'github.com',
      gitlab: 'docs.gitlab.com',
      dingtalk: 'github.com',
      tapd: 'www.tapd.cn',
      'tencent-gongfeng': 'code.tencent.com',
      'tencent-meeting': 'meeting.tencent.com',
      wecom: 'github.com',
    }
    for (const preset of CONNECTOR_PRESETS) {
      expect(new URL(preset.docsUrl).hostname).toBe(expectedHosts[preset.id])
    }
    expect(CONNECTOR_PRESETS.find((preset) => preset.id === 'wecom')?.docsUrl).toBe('https://github.com/WecomTeam/wecom-cli')
  })
})
