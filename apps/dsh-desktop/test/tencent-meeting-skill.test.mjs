import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTencentMeetingExecutionEnvironment,
  createTencentMeetingSkillPlan,
  validateTencentMeetingSkillSource,
} from '../src/extensions/providers/tencent-meeting-skill.mjs'

test('Tencent Meeting plan blocks until provider-published runtime requirements are supplied', () => {
  const plan = createTencentMeetingSkillPlan({
    sourceUrl: 'https://meeting.tencent.com/support/topic/2233/index.html',
    version: '1.0.0',
  })
  assert.equal(plan.status, 'blocked')
  assert.equal(plan.reason, 'official-requirements-required')
  assert.equal('token' in plan, false)
})

test('Tencent Meeting plan accepts only provider requirements and injects the token at runtime', () => {
  const plan = createTencentMeetingSkillPlan({
    sourceUrl: 'https://meeting.tencent.com/support/topic/2233/index.html',
    version: '1.0.0',
    officialRequirements: {
      pythonVersion: 'provider-declared',
      serviceUrl: 'https://meeting.tencent.com/official-skill-service',
      credentialEnv: 'TENCENT_MEETING_TOKEN',
    },
  })
  assert.equal(plan.status, 'ready-for-package-selection')
  assert.equal(plan.credential.env, 'TENCENT_MEETING_TOKEN')
  assert.deepEqual(buildTencentMeetingExecutionEnvironment('test-token-123'), { TENCENT_MEETING_TOKEN: 'test-token-123' })
  assert.throws(() => buildTencentMeetingExecutionEnvironment('short'), /required at execution time/)
})

test('Tencent Meeting source validation rejects community or insecure hosts', () => {
  assert.equal(validateTencentMeetingSkillSource('https://cloud.tencent.com/product/meeting'), 'https://cloud.tencent.com/product/meeting')
  assert.throws(() => validateTencentMeetingSkillSource('https://example.com/skill'), /official provider host/)
  assert.throws(() => validateTencentMeetingSkillSource('http://meeting.tencent.com/skill'), /HTTPS/)
})
