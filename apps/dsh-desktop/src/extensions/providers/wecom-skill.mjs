import { join, resolve } from 'node:path'

const OFFICIAL_REPOSITORY = 'https://github.com/WecomTeam/wecom-cli'
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/u
const ALLOWED_AUTH_ARGS = Object.freeze({
  init: ['auth', 'init'],
  show: ['auth', 'show', '--status'],
})

function fail(message) {
  throw new Error(message)
}

export function validateWecomSkillSource(sourceUrl = OFFICIAL_REPOSITORY) {
  if (typeof sourceUrl !== 'string') fail('WeCom Skill source is required')
  let url
  try { url = new URL(sourceUrl) } catch { fail('WeCom Skill source must be an HTTPS URL') }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.username || url.password) {
    fail('WeCom Skill source must use the official GitHub repository')
  }
  const path = url.pathname.replace(/\/+$/u, '')
  if (path !== '/WecomTeam/wecom-cli') fail('WeCom Skill source must be the official GitHub repository WecomTeam/wecom-cli')
  return `${url.origin}${path}`
}

export function validateNodeVersion(version) {
  if (typeof version !== 'string') fail('Node.js version is required')
  const match = /^(?:v)?(\d+)(?:\.|$)/u.exec(version.trim())
  if (!match || Number(match[1]) < 18) fail('WeCom CLI requires Node.js >= 18')
  return version.trim()
}

export function createWecomSkillPlan({ dshHome, sourceUrl = OFFICIAL_REPOSITORY, version, nodeVersion } = {}) {
  const source = validateWecomSkillSource(sourceUrl)
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) fail('WeCom CLI version or commit is required')
  validateNodeVersion(nodeVersion)
  if (typeof dshHome !== 'string' || dshHome.length === 0) fail('DSH_HOME is required')
  const target = resolve(dshHome, 'desktop', 'tools', 'wecom-cli', version)
  return {
    providerId: 'wecom',
    status: 'ready-for-managed-install',
    sourceUrl: source,
    version,
    package: {
      name: '@wecom/cli',
      installMode: 'app-managed',
      target,
      globalInstall: false,
      requiresSudo: false,
      nodeMinimum: 18,
    },
    skills: { sourcePath: 'skills', installMode: 'verified-package' },
    authorization: { init: [...ALLOWED_AUTH_ARGS.init], show: [...ALLOWED_AUTH_ARGS.show] },
    liveVerification: 'pending',
  }
}

export function buildWecomCommand({ binaryPath, action }) {
  if (typeof binaryPath !== 'string' || binaryPath.length === 0) fail('WeCom CLI binary path is required')
  if (action !== 'init' && action !== 'show') fail('unsupported WeCom CLI authorization action')
  return { file: binaryPath, args: [...ALLOWED_AUTH_ARGS[action]], shell: false }
}

export const WECOM_OFFICIAL_REPOSITORY = OFFICIAL_REPOSITORY
