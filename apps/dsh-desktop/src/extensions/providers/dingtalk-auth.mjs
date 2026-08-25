import { oauthCredentialReferences } from '../connector-secrets.mjs'

export const DINGTALK_MCP_PACKAGE = 'dingtalk-mcp@latest'
export const dingtalkCredentialReferences = Object.freeze({
  ...oauthCredentialReferences('dingtalk'),
  clientId: 'DSH_CONNECTOR_DINGTALK_CLIENT_ID',
  clientSecret: 'DSH_CONNECTOR_DINGTALK_CLIENT_SECRET',
})

export const DINGTALK_PROFILE_CATALOG = Object.freeze({
  'dingtalk-contacts': Object.freeze({ readOnly: true, permissionHints: ['qyapi_addresslist_search', 'qyapi_get_member'] }),
  'dingtalk-department': Object.freeze({ readOnly: true, permissionHints: ['qyapi_addresslist_search'] }),
  'dingtalk-honor': Object.freeze({ readOnly: true, permissionHints: ['qyapi_get_honor'] }),
  'dingtalk-checkin': Object.freeze({ readOnly: true, permissionHints: ['qyapi_attendance_list'] }),
  'dingtalk-report': Object.freeze({ readOnly: true, permissionHints: ['qyapi_report_list'] }),
  'dingtalk-calendar': Object.freeze({ readOnly: false, permissionHints: ['calendar_read', 'calendar_write'] }),
  'dingtalk-tasks': Object.freeze({ readOnly: false, permissionHints: ['todo_read', 'todo_write'] }),
  'dingtalk-robot-send-message': Object.freeze({ readOnly: false, permissionHints: ['qyapi_robot_sendmsg'] }),
  'dingtalk-notice': Object.freeze({ readOnly: false, permissionHints: ['qyapi_notice_read', 'qyapi_notice_send'] }),
  'dingtalk-app-manage': Object.freeze({ readOnly: false, permissionHints: ['app_manage'] }),
  'dingtalk-service-window': Object.freeze({ readOnly: false, permissionHints: ['service_window_manage'] }),
  'dingtalk-teambition': Object.freeze({ readOnly: false, permissionHints: ['teambition_read', 'teambition_write'] }),
})
export const DINGTALK_DEFAULT_PROFILES = Object.freeze(['dingtalk-contacts'])

function status({ mode = 'app-credentials', state, detailKey, grantedScopes, missingPermissions }) {
  return {
    connectorId: 'dingtalk', providerId: 'dingtalk', mode, state,
    ...(grantedScopes?.length ? { grantedScopes: [...new Set(grantedScopes)] } : {}),
    ...(missingPermissions?.length ? { missingPermissions: [...new Set(missingPermissions)] } : {}),
    ...(detailKey ? { detailKey } : {}),
  }
}

export function normalizeDingTalkProfiles(value) {
  const raw = value === undefined ? [...DINGTALK_DEFAULT_PROFILES] : Array.isArray(value) ? value : String(value).split(',')
  const profiles = [...new Set(raw.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))]
  const invalid = profiles.filter((profile) => !Object.hasOwn(DINGTALK_PROFILE_CATALOG, profile))
  if (invalid.length > 0) return { profiles: [], invalid }
  if (profiles.length === 0) return { profiles: [...DINGTALK_DEFAULT_PROFILES], invalid: [] }
  return { profiles, invalid: [] }
}

export function dingtalkProfilePermissionHints(profiles) {
  const normalized = normalizeDingTalkProfiles(profiles)
  if (normalized.invalid.length > 0) return []
  return [...new Set(normalized.profiles.flatMap((profile) => DINGTALK_PROFILE_CATALOG[profile].permissionHints))]
}

/** Build the official DingTalk MCP launch shape with exact env key casing. */
export function buildDingTalkCommand({ clientId, clientSecret, profiles }) {
  const normalized = normalizeDingTalkProfiles(profiles)
  if (normalized.invalid.length > 0) throw new Error(`unsupported DingTalk profiles: ${normalized.invalid.join(',')}`)
  if (typeof clientId !== 'string' || clientId.length === 0) throw new TypeError('DingTalk Client ID is required')
  if (typeof clientSecret !== 'string' || clientSecret.length === 0) throw new TypeError('DingTalk Client Secret is required')
  return Object.freeze({
    command: 'npx',
    args: ['-y', DINGTALK_MCP_PACKAGE],
    env: {
      DINGTALK_Client_ID: clientId,
      DINGTALK_Client_Secret: clientSecret,
      ACTIVE_PROFILES: normalized.profiles.join(','),
    },
  })
}

async function secretValues(context, references) {
  if (!context.secretStore || typeof context.secretStore.resolveMany !== 'function') return {}
  try {
    return await context.secretStore.resolveMany(references)
  } catch {
    return {}
  }
}

function hasSecrets(context) {
  if (!context.secretStore || typeof context.secretStore.has !== 'function') return false
  try {
    return context.secretStore.has(dingtalkCredentialReferences.clientId) && context.secretStore.has(dingtalkCredentialReferences.clientSecret)
  } catch {
    return false
  }
}

export function createDingTalkAuthAdapter() {
  return {
    id: 'dingtalk',
    modes: ['app-credentials'],
    async authorize(context, input = {}) {
      const mode = input.mode ?? 'app-credentials'
      if (mode !== 'app-credentials') return status({ mode, state: 'error', detailKey: 'dingtalk.auth-mode-unsupported' })
      if (!context.secretStore || typeof context.secretStore.setMany !== 'function') return status({ mode, state: 'error', detailKey: 'dingtalk.secure-storage-unavailable' })
      const normalized = normalizeDingTalkProfiles(input.profiles)
      if (normalized.invalid.length > 0) return status({ mode, state: 'missing-permission', detailKey: 'dingtalk.profile-not-approved', missingPermissions: normalized.invalid })
      try {
        buildDingTalkCommand({ clientId: input.clientId, clientSecret: input.clientSecret, profiles: normalized.profiles })
        await context.secretStore.setMany({ [dingtalkCredentialReferences.clientId]: input.clientId, [dingtalkCredentialReferences.clientSecret]: input.clientSecret })
        if (typeof context.saveDingTalkProfiles === 'function') await context.saveDingTalkProfiles(normalized.profiles)
        return status({ mode, state: 'ready', grantedScopes: normalized.profiles })
      } catch (error) {
        return status({ mode, state: 'error', detailKey: `dingtalk.${error?.code ?? 'invalid-credentials'}` })
      }
    },
    async status(context, connector = {}) {
      const mode = connector.mode ?? 'app-credentials'
      return hasSecrets(context) ? status({ mode, state: 'ready', grantedScopes: normalizeDingTalkProfiles(connector.profiles).profiles }) : status({ mode, state: 'not-configured' })
    },
    async disconnect(context, connector = {}) {
      if (context.secretStore && typeof context.secretStore.removeMany === 'function') await context.secretStore.removeMany(Object.values(dingtalkCredentialReferences))
      return status({ mode: connector.mode ?? 'app-credentials', state: 'not-configured' })
    },
    async verify(context, connector = {}) {
      const mode = connector.mode ?? 'app-credentials'
      if (!hasSecrets(context)) return status({ mode, state: 'reauthorization-required', detailKey: 'dingtalk.authorization-required' })
      const normalized = normalizeDingTalkProfiles(connector.profiles)
      if (normalized.invalid.length > 0) return status({ mode, state: 'missing-permission', detailKey: 'dingtalk.profile-not-approved', missingPermissions: normalized.invalid })
      if (typeof context.probe === 'function') {
        try {
          const result = await context.probe({ providerId: 'dingtalk', profile: DINGTALK_DEFAULT_PROFILES[0], readOnly: true })
          if (result?.status === 401 || result?.statusCode === 401) return status({ mode, state: 'reauthorization-required', detailKey: 'dingtalk.authorization-expired' })
          if (result?.status === 403 || result?.statusCode === 403) return status({ mode, state: 'missing-permission', detailKey: 'dingtalk.permission-denied', missingPermissions: result.missingPermissions })
          if (result?.ok === false) return status({ mode, state: 'error', detailKey: 'dingtalk.probe-failed' })
        } catch {
          return status({ mode, state: 'error', detailKey: 'dingtalk.network-error' })
        }
      }
      return status({ mode, state: 'ready', grantedScopes: normalized.profiles })
    },
  }
}
