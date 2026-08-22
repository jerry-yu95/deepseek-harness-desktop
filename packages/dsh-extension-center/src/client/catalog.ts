/**
 * Small, reviewable catalog of provider configurations. These are public
 * templates only; credentials are always entered in the import preview and
 * encrypted by the desktop main process.
 */
export interface ConnectorPreset {
  id: string
  name: string
  description: string
  docsUrl: string
  json?: string
  status: 'ready' | 'needs-provider-json'
}

export const CONNECTOR_PRESETS: readonly ConnectorPreset[] = [
  {
    id: 'github',
    name: 'GitHub MCP',
    description: 'GitHub 官方远程 MCP；可访问仓库、Issue、PR 与 Actions。',
    docsUrl: 'https://github.com/github/github-mcp-server',
    status: 'ready',
    json: JSON.stringify({
      mcpServers: {
        github: {
          type: 'http',
          url: 'https://api.githubcopilot.com/mcp/',
          headers: { Authorization: 'Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}' },
        },
      },
    }, null, 2),
  },
  {
    id: 'feishu',
    name: '飞书 / Lark MCP',
    description: '飞书官方 OpenAPI MCP；使用自建应用 App ID 与 App Secret。',
    docsUrl: 'https://github.com/larksuite/lark-openapi-mcp',
    status: 'ready',
    json: JSON.stringify({
      mcpServers: {
        'lark-mcp': {
          command: 'npx',
          args: ['-y', '@larksuiteoapi/lark-mcp', 'mcp', '-a', '${FEISHU_APP_ID}', '-s', '${FEISHU_APP_SECRET}'],
        },
      },
    }, null, 2),
  },
  {
    id: 'gitlab',
    name: 'GitLab MCP',
    description: 'GitLab 官方 MCP；需要实例开启 MCP，远程连接可能触发 OAuth 授权。',
    docsUrl: 'https://docs.gitlab.com/user/model_context_protocol/mcp_server/',
    status: 'ready',
    json: JSON.stringify({
      mcpServers: {
        gitlab: {
          type: 'http',
          url: 'https://gitlab.com/api/v4/mcp',
        },
      },
    }, null, 2),
  },
  {
    id: 'tapd',
    name: 'TAPD MCP',
    description: 'TAPD 官方已提供 MCP / Skill / CLI 能力；等待其公开稳定 JSON 模板后接入预设。',
    docsUrl: 'https://www.tapd.cn/official/intelligent_collaboration_index',
    status: 'needs-provider-json',
  },
]
