import assert from 'node:assert/strict'
import { basename, dirname } from 'node:path'
import test from 'node:test'

import {
  buildWecomCommand,
  createWecomSkillPlan,
  validateNodeVersion,
  validateWecomSkillSource,
  WECOM_OFFICIAL_REPOSITORY,
} from '../src/extensions/providers/wecom-skill.mjs'

test('WeCom source is pinned to the provider-owned repository', () => {
  assert.equal(validateWecomSkillSource(), WECOM_OFFICIAL_REPOSITORY)
  assert.throws(() => validateWecomSkillSource('https://github.com/community/wecom-cli'), /official GitHub repository/)
  assert.throws(() => validateWecomSkillSource('https://github.com/WecomTeam/wecom-cli/archive/main.zip'), /WecomTeam\/wecom-cli/)
})

test('WeCom managed plan never requests global install or sudo', () => {
  const plan = createWecomSkillPlan({
    dshHome: '/tmp/dsh-home',
    version: '1.1.0',
    nodeVersion: 'v20.10.0',
  })
  assert.equal(plan.package.name, '@wecom/cli')
  assert.equal(plan.package.globalInstall, false)
  assert.equal(plan.package.requiresSudo, false)
  assert.equal(basename(plan.package.target), '1.1.0')
  assert.equal(basename(dirname(plan.package.target)), 'wecom-cli')
  assert.equal(basename(dirname(dirname(plan.package.target))), 'tools')
  assert.equal(basename(dirname(dirname(dirname(plan.package.target)))), 'desktop')
  assert.deepEqual(plan.authorization.show, ['auth', 'show', '--status'])
})

test('WeCom command builder returns argv without a shell command string', () => {
  assert.equal(validateNodeVersion('18.0.0'), '18.0.0')
  assert.throws(() => validateNodeVersion('16.20.0'), /Node\.js >= 18/)
  assert.deepEqual(buildWecomCommand({ binaryPath: '/tmp/wecom-cli', action: 'show' }), {
    file: '/tmp/wecom-cli', args: ['auth', 'show', '--status'], shell: false,
  })
  assert.throws(() => buildWecomCommand({ binaryPath: '/tmp/wecom-cli', action: 'exec' }), /unsupported/)
})
