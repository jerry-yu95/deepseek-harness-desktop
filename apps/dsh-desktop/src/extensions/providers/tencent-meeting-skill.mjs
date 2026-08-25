const OFFICIAL_HOSTS = new Set(['meeting.tencent.com', 'cloud.tencent.com'])
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u

function fail(message) {
  throw new Error(message)
}

function validateHttpsUrl(value, field) {
  if (typeof value !== 'string') fail(`${field} is required`)
  let url
  try { url = new URL(value) } catch { fail(`${field} must be an HTTPS URL`) }
  if (url.protocol !== 'https:' || url.username || url.password) fail(`${field} must be an HTTPS URL without credentials`)
  return url
}

export function validateTencentMeetingSkillSource(sourceUrl) {
  const url = validateHttpsUrl(sourceUrl, 'Tencent Meeting Skill source')
  if (!OFFICIAL_HOSTS.has(url.hostname.toLowerCase())) fail('Tencent Meeting Skill source is not an official provider host')
  return url.toString()
}

export function createTencentMeetingSkillPlan({ sourceUrl, version, officialRequirements } = {}) {
  const normalizedSource = validateTencentMeetingSkillSource(sourceUrl)
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) fail('Tencent Meeting Skill version must be semver')
  if (!officialRequirements) {
    return {
      providerId: 'tencent-meeting',
      status: 'blocked',
      reason: 'official-requirements-required',
      sourceUrl: normalizedSource,
      version,
      nextAction: 'select-the-official-skill-package-and-copy-its-published-runtime-requirements',
    }
  }
  if (typeof officialRequirements.pythonVersion !== 'string' || officialRequirements.pythonVersion.trim() === '') {
    fail('Tencent Meeting Skill official Python requirement is required')
  }
  const serviceUrl = validateHttpsUrl(officialRequirements.serviceUrl, 'Tencent Meeting Skill service URL')
  if (!OFFICIAL_HOSTS.has(serviceUrl.hostname.toLowerCase())) fail('Tencent Meeting Skill service URL is not an official provider host')
  if (officialRequirements.credentialEnv !== 'TENCENT_MEETING_TOKEN') {
    fail('Tencent Meeting Skill credential environment must be TENCENT_MEETING_TOKEN')
  }
  return {
    providerId: 'tencent-meeting',
    status: 'ready-for-package-selection',
    sourceUrl: normalizedSource,
    version,
    package: { mode: 'user-selected-official-package', executesDuringInstall: false },
    runtime: { kind: 'python', requirement: officialRequirements.pythonVersion, serviceUrl: serviceUrl.toString() },
    credential: { env: 'TENCENT_MEETING_TOKEN', injection: 'runtime-only', storage: 'desktop-private-store' },
    liveVerification: 'pending',
  }
}

export function buildTencentMeetingExecutionEnvironment(token) {
  if (typeof token !== 'string' || token.trim().length < 8) fail('Tencent Meeting token is required at execution time')
  return { TENCENT_MEETING_TOKEN: token }
}
