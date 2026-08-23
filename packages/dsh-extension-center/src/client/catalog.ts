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
    description: '直接粘贴 TAPD 页面提供的官方 mcpServers JSON，再替换其中令牌即可；应用不会要求重复填写组织或项目参数。',
    docsUrl: 'https://www.tapd.cn/official/intelligent_collaboration_index',
    status: 'needs-provider-json',
  },
]
