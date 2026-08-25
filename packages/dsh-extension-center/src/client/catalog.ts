/**
 * Small, reviewable catalog of provider configurations. These are public
 * templates only; credentials are always entered in the import preview and
 * encrypted by the desktop main process.
 */
export interface ConnectorPreset {
  id: string
  name: string
  provider: string
  description: string
  docsUrl: string
  capabilities: readonly string[]
  json?: string
  integration: 'mcp-template' | 'provider-json' | 'official-skill'
  documentation: 'official-mcp' | 'provider-config' | 'official-skill' | 'official-api'
  /** Public authorization modes only; credentials never belong in catalog data. */
  authModes?: readonly ('oauth' | 'pat' | 'official-cli' | 'app-credentials')[]
  authScopes?: readonly string[]
}

export const CONNECTOR_PRESETS: readonly ConnectorPreset[] = [
  {
    id: 'github',
    name: 'GitHub MCP',
    provider: 'GitHub',
    description: 'GitHub 官方远程 MCP；可访问仓库、Issue、PR 与 Actions。',
    docsUrl: 'https://github.com/github/github-mcp-server',
    capabilities: ['仓库', 'Issue', 'Pull Request', 'Actions'],
    integration: 'mcp-template',
    documentation: 'official-mcp',
    authModes: ['oauth', 'pat'],
    authScopes: ['repo', 'read:user', 'user:email'],
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
    provider: '字节跳动',
    description: '飞书官方 OpenAPI MCP；使用自建应用 App ID 与 App Secret。',
    docsUrl: 'https://github.com/larksuite/lark-openapi-mcp',
    capabilities: ['文档', '多维表格', '消息', '日历'],
    integration: 'mcp-template',
    documentation: 'official-mcp',
    authModes: ['official-cli', 'app-credentials'],
    authScopes: ['offline_access'],
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
    provider: 'GitLab',
    description: 'GitLab 官方 MCP；需要实例开启 MCP，远程连接可能触发 OAuth 授权。',
    docsUrl: 'https://docs.gitlab.com/user/model_context_protocol/mcp_server/',
    capabilities: ['仓库', 'Issue', 'Merge Request', 'CI/CD'],
    integration: 'mcp-template',
    documentation: 'official-mcp',
    authModes: ['oauth'],
    authScopes: ['mcp'],
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
    id: 'dingtalk',
    name: '钉钉 MCP',
    provider: '钉钉',
    description: '钉钉官方 MCP；通过自建应用 Client ID、Client Secret 和能力 Profile 接入。',
    docsUrl: 'https://github.com/open-dingtalk/dingtalk-mcp',
    capabilities: ['通讯录', '日历', '待办', '机器人'],
    integration: 'mcp-template',
    documentation: 'official-mcp',
    authModes: ['app-credentials'],
    authScopes: ['dingtalk-contacts'],
    json: JSON.stringify({
      mcpServers: {
        'dingtalk-mcp': {
          command: 'npx',
          args: ['-y', 'dingtalk-mcp@latest'],
          env: {
            DINGTALK_Client_ID: '${DINGTALK_Client_ID}',
            DINGTALK_Client_Secret: '${DINGTALK_Client_Secret}',
            ACTIVE_PROFILES: 'dingtalk-contacts',
          },
        },
      },
    }, null, 2),
  },
  {
    id: 'tapd',
    name: 'TAPD MCP',
    provider: '腾讯 TAPD',
    description: '直接粘贴 TAPD 页面提供的官方 mcpServers JSON，再替换其中令牌即可；应用不会要求重复填写组织或项目参数。',
    docsUrl: 'https://www.tapd.cn/official/intelligent_collaboration_index',
    capabilities: ['需求', '缺陷', '迭代', '项目管理'],
    integration: 'provider-json',
    documentation: 'provider-config',
  },
  {
    id: 'tencent-gongfeng',
    name: '腾讯工蜂',
    provider: '腾讯工蜂',
    description: '当前仅确认工蜂官方 API / OAuth 能力；如团队提供 MCP JSON 可粘贴接入，应用不会把 API 文档冒充成官方 MCP。',
    docsUrl: 'https://code.tencent.com/help/oauth2/',
    capabilities: ['仓库', 'Issue', 'Merge Request', '流水线'],
    integration: 'provider-json',
    documentation: 'official-api',
  },
  {
    id: 'tencent-meeting',
    name: '腾讯会议 Skill',
    provider: '腾讯会议',
    description: '腾讯会议当前官方路径是 Skill 与本地代理。打开官方说明安装后，Harness 会从技能目录发现。',
    docsUrl: 'https://meeting.tencent.com/support/topic/2233/index.html',
    capabilities: ['会议查询', '会议创建', '参会管理'],
    integration: 'official-skill',
    documentation: 'official-skill',
  },
  {
    id: 'wecom',
    name: '企业微信 Skill',
    provider: '企业微信',
    description: '企业微信官方团队当前提供 wecom-cli 与 Agent Skills；按官方仓库安装，不冒充通用 MCP 服务。',
    docsUrl: 'https://github.com/WecomTeam/wecom-cli',
    capabilities: ['消息', '通讯录', '客户联系', '办公协作'],
    integration: 'official-skill',
    documentation: 'official-skill',
  },
]
